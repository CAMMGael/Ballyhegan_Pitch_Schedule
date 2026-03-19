import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { BOOKING_TYPE_COLOURS } from "@/lib/constants";
import type { CalendarEvent } from "@/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const venueId = searchParams.get("venueId");
  const teamIds = searchParams.get("teamIds");
  const includeAll = searchParams.get("includeAll") === "true";

  if (!start || !end) {
    return NextResponse.json({ error: "start and end are required" }, { status: 400 });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  // Build booking query
  const statusFilter = includeAll
    ? { in: ["approved", "pending"] }
    : { equals: "approved" };

  const bookings = await prisma.booking.findMany({
    where: {
      bookingDate: { gte: startDate, lte: endDate },
      status: statusFilter,
      ...(venueId && venueId !== "all" ? { venueId } : {}),
      ...(teamIds ? { teamId: { in: teamIds.split(",") } } : {}),
    },
    include: {
      team: { select: { name: true } },
      venue: { select: { name: true } },
    },
    orderBy: [{ bookingDate: "asc" }, { startTime: "asc" }],
  });

  // Get closures that overlap with the requested range
  // A closure overlaps if: closedDate <= endDate AND (closedDateEnd >= startDate OR (closedDateEnd is null AND closedDate >= startDate))
  const closures = await prisma.venueClosure.findMany({
    where: {
      closedDate: { lte: endDate },
      OR: [
        { closedDateEnd: { gte: startDate } },
        { closedDateEnd: null, closedDate: { gte: startDate } },
      ],
      ...(venueId && venueId !== "all" ? { venueId } : {}),
    },
    include: {
      venue: { select: { name: true } },
    },
  });

  const events: CalendarEvent[] = [];

  // Map bookings to calendar events
  for (const booking of bookings) {
    const dateStr = booking.bookingDate.toISOString().split("T")[0];
    let title = booking.team?.name ?? "Unknown";

    if (booking.bookingType === "match" || booking.bookingType === "fixture_import") {
      if (booking.opponent) {
        title += ` v ${booking.opponent}`;
      }
    }

    if (booking.pitchSectionMode !== "full") {
      title += ` (${booking.pitchSectionMode})`;
    }

    if (booking.status === "pending") {
      title = `[Pending] ${title}`;
    }

    const colour = BOOKING_TYPE_COLOURS[booking.bookingType] ?? "#6b7280";

    events.push({
      id: booking.id,
      title,
      start: `${dateStr}T${booking.startTime}`,
      end: `${dateStr}T${booking.endTime}`,
      backgroundColor: booking.status === "pending" ? `${colour}80` : colour,
      borderColor: colour,
      textColor: "#ffffff",
      extendedProps: {
        bookingType: booking.bookingType as CalendarEvent["extendedProps"]["bookingType"],
        status: booking.status as CalendarEvent["extendedProps"]["status"],
        teamName: booking.team?.name,
        opponent: booking.opponent ?? undefined,
        venueName: booking.venue.name,
        pitchSection: booking.pitchSectionMode,
        notes: booking.notes ?? undefined,
      },
    });
  }

  // Map closures to calendar events
  // For date-range closures, generate an event for each day in the range
  for (const closure of closures) {
    const isAllDay = !closure.startTime || !closure.endTime;
    const closureStart = closure.closedDate;
    const closureEnd = closure.closedDateEnd ?? closure.closedDate;

    // Determine if this is a multi-day closure
    const isMultiDay = closureEnd.getTime() > closureStart.getTime();

    if (isMultiDay && isAllDay) {
      // For multi-day all-day closures, use FullCalendar's date range (end is exclusive)
      const startStr = closureStart.toISOString().split("T")[0];
      const endExclusive = new Date(closureEnd);
      endExclusive.setDate(endExclusive.getDate() + 1);
      const endStr = endExclusive.toISOString().split("T")[0];

      events.push({
        id: `closure-${closure.id}`,
        title: `CLOSED: ${closure.venue.name}${closure.reason ? ` - ${closure.reason}` : ""}`,
        start: startStr,
        end: endStr,
        backgroundColor: BOOKING_TYPE_COLOURS.closed,
        borderColor: BOOKING_TYPE_COLOURS.closed,
        textColor: "#ffffff",
        extendedProps: {
          bookingType: "closed",
          status: "approved",
          venueName: closure.venue.name,
          notes: closure.reason ?? undefined,
        },
      });
    } else if (isMultiDay && !isAllDay) {
      // Multi-day with hourly times: generate an event per day within the visible range
      const current = new Date(Math.max(closureStart.getTime(), startDate.getTime()));
      const last = new Date(Math.min(closureEnd.getTime(), endDate.getTime()));

      while (current <= last) {
        const dateStr = current.toISOString().split("T")[0];
        events.push({
          id: `closure-${closure.id}-${dateStr}`,
          title: `CLOSED: ${closure.venue.name}${closure.reason ? ` - ${closure.reason}` : ""}`,
          start: `${dateStr}T${closure.startTime}`,
          end: `${dateStr}T${closure.endTime}`,
          backgroundColor: BOOKING_TYPE_COLOURS.closed,
          borderColor: BOOKING_TYPE_COLOURS.closed,
          textColor: "#ffffff",
          extendedProps: {
            bookingType: "closed",
            status: "approved",
            venueName: closure.venue.name,
            notes: closure.reason ?? undefined,
          },
        });
        current.setDate(current.getDate() + 1);
      }
    } else {
      // Single day closure
      const dateStr = closureStart.toISOString().split("T")[0];
      events.push({
        id: `closure-${closure.id}`,
        title: `CLOSED: ${closure.venue.name}${closure.reason ? ` - ${closure.reason}` : ""}`,
        start: isAllDay ? dateStr : `${dateStr}T${closure.startTime}`,
        end: isAllDay ? dateStr : `${dateStr}T${closure.endTime}`,
        backgroundColor: BOOKING_TYPE_COLOURS.closed,
        borderColor: BOOKING_TYPE_COLOURS.closed,
        textColor: "#ffffff",
        extendedProps: {
          bookingType: "closed",
          status: "approved",
          venueName: closure.venue.name,
          notes: closure.reason ?? undefined,
        },
      });
    }
  }

  return NextResponse.json(events);
}
