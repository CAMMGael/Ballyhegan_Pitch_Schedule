import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { notifyAllAdmins } from "@/lib/notifications";
import * as cheerio from "cheerio";
import crypto from "crypto";

const FIXTURES_URL = "https://ballyhegan.gaa.ie/fixtures-results/";

function hashFixture(data: {
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
}): string {
  const raw = `${data.date}|${data.time}|${data.homeTeam}|${data.awayTeam}|${data.competition}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMinutes = h * 60 + m + minutes;
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

function subtractMinutesFromTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  let totalMinutes = h * 60 + m - minutes;
  if (totalMinutes < 0) totalMinutes = 0;
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

function timesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return toMin(start1) < toMin(end2) && toMin(start2) < toMin(end1);
}

async function getSettingValue<T>(key: string, defaultValue: T): Promise<T> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (!row) return defaultValue;
  return row.value as T;
}

async function authenticateRequest(req: NextRequest): Promise<{ id: string } | null> {
  // Check for cron secret header first
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret && cronSecret === process.env.CRON_SECRET) {
    return { id: "system" };
  }

  // Otherwise require admin auth
  try {
    const admin = await requireAdmin();
    return admin;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fixtures = await prisma.importedFixture.findMany({
    include: {
      booking: {
        select: {
          id: true,
          status: true,
          startTime: true,
          endTime: true,
          venue: { select: { name: true } },
        },
      },
    },
    orderBy: { fixtureDate: "desc" },
  });

  // Get most recent scrape time
  const lastScraped = fixtures.length > 0
    ? fixtures.reduce((latest, f) =>
        new Date(f.lastScrapedAt) > new Date(latest.lastScrapedAt) ? f : latest
      ).lastScrapedAt
    : null;

  return NextResponse.json({
    fixtures,
    lastScrape: lastScraped,
  });
}

export async function POST(req: NextRequest) {
  const actor = await authenticateRequest(req);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isSystem = actor.id === "system";
  const actorType = isSystem ? "system" : "admin";
  const actorId = isSystem ? undefined : actor.id;

  let imported = 0;
  let skippedDuplicates = 0;
  let conflicts = 0;

  try {
    // Fetch the fixtures page
    const response = await fetch(FIXTURES_URL, {
      headers: {
        "User-Agent": "BallyheganPitchScheduler/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch fixtures page: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Get default venue (Ballyhegan)
    const defaultVenue = await prisma.venue.findFirst({
      where: { name: { contains: "Ballyhegan", mode: "insensitive" } },
    });

    // Get settings for match duration
    const matchDuration = await getSettingValue<number>("match_default_duration", 120);
    const preTime = await getSettingValue<number>("match_pre_time", 60);
    const totalDuration = matchDuration + preTime; // default: 3 hours total

    // Parse fixtures from the page
    // GAA website fixture rows typically appear in table rows or structured divs
    const fixtureData: Array<{
      date: string;
      time: string;
      homeTeam: string;
      awayTeam: string;
      competition: string;
      venue: string;
    }> = [];

    // Try parsing table-based fixture layouts
    $("table tbody tr, .fixtures-list .fixture-item, .fixture-row, [class*='fixture']").each((_i, el) => {
      const $el = $(el);
      const text = $el.text();

      // Try to extract fixture info from table cells
      const cells = $el.find("td");
      if (cells.length >= 3) {
        const dateText = $(cells[0]).text().trim();
        const timeText = $(cells[1]).text().trim();
        const teamsText = $(cells[2]).text().trim();
        const competitionText = cells.length >= 4 ? $(cells[3]).text().trim() : "";
        const venueText = cells.length >= 5 ? $(cells[4]).text().trim() : "";

        // Parse teams (e.g., "Home Team v Away Team" or "Home Team vs Away Team")
        const teamsMatch = teamsText.match(/(.+?)\s+v(?:s\.?)?\s+(.+)/i);
        if (teamsMatch && dateText) {
          fixtureData.push({
            date: dateText,
            time: timeText || "14:00",
            homeTeam: teamsMatch[1].trim(),
            awayTeam: teamsMatch[2].trim(),
            competition: competitionText,
            venue: venueText,
          });
          return;
        }
      }

      // Try alternative structure: divs with data attributes or class-based layouts
      const dateEl = $el.find("[class*='date'], .date, time").first();
      const teamsEl = $el.find("[class*='team'], .teams, .match").first();
      const venueEl = $el.find("[class*='venue'], .venue, .location").first();
      const compEl = $el.find("[class*='competition'], .competition, .comp").first();

      if (dateEl.length && teamsEl.length) {
        const dateText = dateEl.text().trim();
        const teamsText = teamsEl.text().trim();
        const venueText = venueEl.text().trim();
        const compText = compEl.text().trim();

        const teamsMatch = teamsText.match(/(.+?)\s+v(?:s\.?)?\s+(.+)/i);
        if (teamsMatch) {
          // Extract time from date text if present
          const timeMatch = dateText.match(/(\d{1,2}[:.]\d{2})/);
          fixtureData.push({
            date: dateText,
            time: timeMatch ? timeMatch[1].replace(".", ":") : "14:00",
            homeTeam: teamsMatch[1].trim(),
            awayTeam: teamsMatch[2].trim(),
            competition: compText,
            venue: venueText,
          });
        }
      }

      // Fallback: look for common GAA fixture text patterns in the whole text block
      if (fixtureData.length === 0 || !$el.find("td").length) {
        const fullMatch = text.match(
          /(\d{1,2}[\s/.-]\w+[\s/.-]\d{2,4})\s+.*?(\d{1,2}[:.]\d{2})?\s*(.+?)\s+v(?:s\.?)?\s+(.+?)(?:\s+[-|]\s+(.+?))?(?:\s+[-|]\s+(.+?))?$/m
        );
        if (fullMatch) {
          fixtureData.push({
            date: fullMatch[1].trim(),
            time: fullMatch[2]?.replace(".", ":") || "14:00",
            homeTeam: fullMatch[3].trim(),
            awayTeam: fullMatch[4].trim(),
            competition: fullMatch[5]?.trim() || "",
            venue: fullMatch[6]?.trim() || "",
          });
        }
      }
    });

    // Filter to home fixtures only (venue contains "Ballyhegan")
    const homeFixtures = fixtureData.filter(
      (f) =>
        f.venue.toLowerCase().includes("ballyhegan") ||
        f.homeTeam.toLowerCase().includes("ballyhegan")
    );

    // Process each home fixture
    for (const fixture of homeFixtures) {
      // Normalize time format
      const time = fixture.time.includes(":")
        ? fixture.time
        : fixture.time.replace(".", ":");
      const normalizedTime = time.padStart(5, "0");

      // Parse date - try multiple formats
      let fixtureDate: Date | null = null;
      const dateStr = fixture.date.replace(/\s+/g, " ").trim();

      // Try ISO-like format first
      const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        fixtureDate = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`);
      }

      // Try DD/MM/YYYY or DD-MM-YYYY
      if (!fixtureDate) {
        const dmy = dateStr.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
        if (dmy) {
          const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
          fixtureDate = new Date(`${year}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`);
        }
      }

      // Try "DD Month YYYY" or "DD Month"
      if (!fixtureDate) {
        const textDate = dateStr.match(
          /(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*(\d{2,4})?/i
        );
        if (textDate) {
          const year = textDate[3] || String(new Date().getFullYear());
          const fullYear = year.length === 2 ? `20${year}` : year;
          fixtureDate = new Date(`${textDate[2]} ${textDate[1]}, ${fullYear}`);
        }
      }

      if (!fixtureDate || isNaN(fixtureDate.getTime())) {
        continue; // Skip unparseable dates
      }

      const hash = hashFixture({
        date: fixtureDate.toISOString().split("T")[0],
        time: normalizedTime,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        competition: fixture.competition,
      });

      // Check for duplicates
      const existing = await prisma.importedFixture.findUnique({
        where: { externalHash: hash },
      });

      if (existing) {
        // Update last scraped time
        await prisma.importedFixture.update({
          where: { id: existing.id },
          data: { lastScrapedAt: new Date() },
        });
        skippedDuplicates++;
        continue;
      }

      // Calculate booking times: pre-time before listed time, match duration after
      const bookingStartTime = subtractMinutesFromTime(normalizedTime, preTime);
      const bookingEndTime = addMinutesToTime(normalizedTime, matchDuration);

      // Check for conflicts with existing bookings
      let hasConflict = false;
      if (defaultVenue) {
        const existingBookings = await prisma.booking.findMany({
          where: {
            venueId: defaultVenue.id,
            bookingDate: fixtureDate,
            status: { in: ["approved", "pending"] },
          },
        });

        hasConflict = existingBookings.some((b) =>
          timesOverlap(bookingStartTime, bookingEndTime, b.startTime, b.endTime)
        );

        if (hasConflict) {
          conflicts++;
          await notifyAllAdmins(
            "Fixture Import Conflict",
            `Imported fixture "${fixture.homeTeam} vs ${fixture.awayTeam}" on ${fixtureDate.toISOString().split("T")[0]} at ${normalizedTime} conflicts with an existing booking.`
          );
        }
      }

      // Create booking record for the fixture
      let bookingId: string | undefined;
      if (defaultVenue) {
        const booking = await prisma.booking.create({
          data: {
            venueId: defaultVenue.id,
            bookingDate: fixtureDate,
            startTime: bookingStartTime,
            endTime: bookingEndTime,
            bookingType: "fixture_import",
            status: "approved",
            pitchSectionMode: "full",
            pitchSectionIndex: 1,
            opponent: fixture.awayTeam,
            competition: fixture.competition || null,
            notes: `Auto-imported from GAA website`,
            createdByType: "system",
            createdById: "fixture-scraper",
          },
        });
        bookingId = booking.id;
      }

      // Create imported fixture record
      await prisma.importedFixture.create({
        data: {
          externalHash: hash,
          venueId: defaultVenue?.id,
          bookingId: bookingId,
          fixtureDate: fixtureDate,
          startTime: normalizedTime,
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          competition: fixture.competition || null,
          rawData: JSON.parse(JSON.stringify(fixture)),
          lastScrapedAt: new Date(),
        },
      });

      imported++;
    }

    await logAudit({
      actorType: actorType as "admin" | "system",
      actorId,
      action: "fixtures_scraped",
      details: {
        imported,
        skippedDuplicates,
        conflicts,
        totalParsed: fixtureData.length,
        homeFixtures: homeFixtures.length,
        source: FIXTURES_URL,
      },
    });

    return NextResponse.json({
      success: true,
      imported,
      skippedDuplicates,
      conflicts,
    });
  } catch (error) {
    console.error("Fixture scrape failed:", error);

    await logAudit({
      actorType: actorType as "admin" | "system",
      actorId,
      action: "fixtures_scrape_failed",
      details: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });

    return NextResponse.json(
      { error: "Fixture scrape failed. Check server logs for details." },
      { status: 500 }
    );
  }
}
