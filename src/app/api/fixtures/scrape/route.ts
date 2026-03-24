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

    // Get default venue for home fixtures — "Main Pitch" is the home ground
    const defaultVenue = await prisma.venue.findFirst({
      where: { slug: "main-pitch" },
    });

    // Get settings for match duration
    const matchDuration = await getSettingValue<number>("match_default_duration", 120);
    const preTime = await getSettingValue<number>("match_pre_time", 60);

    // Parse fixtures from the page
    // The GAA website uses this structure inside #fixtures-list:
    //   <h3 class="fix_res_date">Saturday 7th Mar 2026</h3>
    //   <div class="competition">
    //     <div class="competition-name"><a>Competition Name</a></div>
    //     <div class="comp_details">
    //       <div class="home_team"><a>Team A</a></div>
    //       <div class="time">14:00</div>
    //       <div class="away_team"><a>Team B</a></div>
    //     </div>
    //     <div class="more_info"><strong>Venue:</strong> <a>Venue Name</a></div>
    //   </div>
    const fixtureData: Array<{
      date: string;
      time: string;
      homeTeam: string;
      awayTeam: string;
      competition: string;
      venue: string;
    }> = [];

    // Iterate over each fixture block inside the fixtures tab
    $("#fixtures-list div.competition").each((_i, el) => {
      const $el = $(el);

      // The date is in the preceding h3.fix_res_date sibling
      // Walk backwards through previous siblings to find the nearest date heading
      let dateText = "";
      let prev = $el.prev();
      while (prev.length) {
        if (prev.is("h3.fix_res_date")) {
          dateText = prev.text().trim();
          break;
        }
        // If we hit another .competition, check its previous sibling
        prev = prev.prev();
      }

      const homeTeam = $el.find(".home_team").first().text().trim();
      const awayTeam = $el.find(".away_team").first().text().trim();
      const timeText = $el.find(".time").first().text().trim();
      const competition = $el.find(".competition-name").first().text().trim();

      // Venue is inside .more_info, after the <strong>Venue:</strong> label
      const venueLink = $el.find(".more_info a").first();
      const venue = venueLink.length ? venueLink.text().trim() : "";

      if (homeTeam && awayTeam && dateText) {
        fixtureData.push({
          date: dateText,
          time: timeText || "14:00",
          homeTeam,
          awayTeam,
          competition,
          venue,
        });
      }
    });

    // Filter to home fixtures only (venue contains "Ballyhegan" or home team is Ballyhegan)
    const homeFixtures = fixtureData.filter(
      (f) =>
        f.venue.toLowerCase().includes("ballyhegan") ||
        f.homeTeam.toLowerCase().includes("ballyhegan")
    );

    // Process each home fixture
    for (const fixture of homeFixtures) {
      // Normalize time format — skip fixtures with "TBC" time
      const rawTime = fixture.time.trim();
      if (!rawTime || !/\d{1,2}[:.]\d{2}/.test(rawTime)) {
        continue; // Skip fixtures without a confirmed time
      }
      const time = rawTime.includes(":") ? rawTime : rawTime.replace(".", ":");
      const normalizedTime = time.padStart(5, "0");

      // Parse date — GAA site format: "Saturday 7th Mar 2026"
      // Strip day-of-week prefix and ordinal suffixes (st, nd, rd, th)
      let fixtureDate: Date | null = null;
      const dateStr = fixture.date
        .replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+/i, "")
        .replace(/(\d+)(st|nd|rd|th)/i, "$1")
        .replace(/\s+/g, " ")
        .trim();

      // Month name to zero-indexed month number
      const monthMap: Record<string, number> = {
        jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
        apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
        aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
        nov: 10, november: 10, dec: 11, december: 11,
      };

      // Try "7 Mar 2026" or "7 March 2026"
      const textDate = dateStr.match(
        /(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*(\d{2,4})?/i
      );
      if (textDate) {
        const day = parseInt(textDate[1], 10);
        const month = monthMap[textDate[2].toLowerCase()];
        const yearStr = textDate[3] || String(new Date().getFullYear());
        const year = parseInt(yearStr.length === 2 ? `20${yearStr}` : yearStr, 10);
        if (month !== undefined) {
          fixtureDate = new Date(Date.UTC(year, month, day));
        }
      }

      // Fallback: try ISO format (already UTC when using YYYY-MM-DD)
      if (!fixtureDate || isNaN(fixtureDate.getTime())) {
        const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
          fixtureDate = new Date(Date.UTC(
            parseInt(isoMatch[1], 10),
            parseInt(isoMatch[2], 10) - 1,
            parseInt(isoMatch[3], 10)
          ));
        }
      }

      // Fallback: try DD/MM/YYYY
      if (!fixtureDate || isNaN(fixtureDate.getTime())) {
        const dmy = dateStr.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
        if (dmy) {
          const yearStr = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
          fixtureDate = new Date(Date.UTC(
            parseInt(yearStr, 10),
            parseInt(dmy[2], 10) - 1,
            parseInt(dmy[1], 10)
          ));
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
