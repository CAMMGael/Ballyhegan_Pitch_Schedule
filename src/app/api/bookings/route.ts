import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth-helpers";
import { bookingSchema } from "@/lib/validators";
import { checkConflicts } from "@/lib/conflicts";
import { logAudit } from "@/lib/audit";
import { notifyAdminsNewRequest } from "@/lib/email";
import { notifyAllAdmins } from "@/lib/notifications";

function generateUUID(): string {
  return crypto.randomUUID();
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};

  // Team users only see their own bookings
  if (session.role === "team") {
    where.teamId = session.id;
  }

  if (status) {
    where.status = status;
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      team: { select: { name: true } },
      venue: { select: { name: true } },
    },
    orderBy: [{ bookingDate: "desc" }, { startTime: "asc" }],
    take: 100,
  });

  return NextResponse.json(bookings);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = bookingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Team users can only book for their own team
  if (session.role === "team" && data.teamId !== session.id) {
    return NextResponse.json(
      { error: "You can only book for your own team" },
      { status: 403 }
    );
  }

  // Handle recurring bookings
  if (data.recurring) {
    const recurringGroupId = generateUUID();
    const startDate = new Date(data.recurring.startDate);
    const endDate = new Date(data.recurring.endDate);
    const targetDay = data.recurring.dayOfWeek;

    const bookings = [];
    let current = new Date(startDate);

    // Find the first occurrence of the target day
    while (current.getDay() !== targetDay) {
      current = addDays(current, 1);
    }

    while (current <= endDate) {
      const dateStr = current.toISOString().split("T")[0];

      // Check for conflicts
      const conflict = await checkConflicts({
        venueId: data.venueId,
        bookingDate: current,
        startTime: data.startTime,
        endTime: data.endTime,
        pitchSectionMode: data.pitchSectionMode,
      });

      bookings.push({
        teamId: data.teamId,
        venueId: data.venueId,
        bookingDate: new Date(dateStr),
        startTime: data.startTime,
        endTime: data.endTime,
        bookingType: data.bookingType,
        status: conflict.hasConflict ? "declined" : "pending",
        pitchSectionMode: data.pitchSectionMode,
        pitchSectionIndex: data.pitchSectionIndex,
        opponent: data.opponent,
        notes: data.notes,
        altVenueName: data.altVenueName,
        recurringGroupId,
        declineReason: conflict.hasConflict
          ? conflict.closureConflict
            ? `Auto-declined: Venue is closed. ${conflict.closureConflict.reason ?? ""}`
            : "Auto-declined: Conflicts with existing booking(s)"
          : null,
        createdByType: session.role,
        createdById: session.id,
      });

      current = addDays(current, 7);
    }

    // Save recurring template
    await prisma.recurringTemplate.create({
      data: {
        teamId: data.teamId,
        venueId: data.venueId,
        dayOfWeek: targetDay,
        startTime: data.startTime,
        endTime: data.endTime,
        bookingType: data.bookingType,
        pitchSectionMode: data.pitchSectionMode,
        startDate: new Date(data.recurring.startDate),
        endDate: new Date(data.recurring.endDate),
        notes: data.notes,
        recurringGroupId,
      },
    });

    // Create all booking instances
    const created = await prisma.booking.createMany({ data: bookings });

    await logAudit({
      actorType: session.role as "team" | "admin",
      actorId: session.id,
      action: "recurring_booking_created",
      targetType: "booking",
      details: {
        recurringGroupId,
        count: created.count,
        conflictCount: bookings.filter((b) => b.status === "declined").length,
      },
    });

    // Notify admins about recurring booking request
    const pendingCount = bookings.filter((b) => b.status === "pending").length;
    const declinedCount = bookings.filter((b) => b.status === "declined").length;

    if (pendingCount > 0) {
      const team = await prisma.team.findUnique({
        where: { id: data.teamId },
        select: { name: true },
      });
      const venueInfo = await prisma.venue.findUnique({
        where: { id: data.venueId },
        select: { name: true },
      });

      await notifyAdminsNewRequest({
        teamName: team?.name ?? "Unknown",
        venueName: venueInfo?.name ?? "Unknown",
        bookingDate: `Recurring (${pendingCount} sessions, ${declinedCount} auto-declined)`,
        startTime: data.startTime,
        endTime: data.endTime,
        bookingType: data.bookingType,
      });

      await notifyAllAdmins(
        "New Recurring Booking Request",
        `${team?.name ?? "Unknown"} has requested a recurring booking at ${venueInfo?.name ?? "Unknown"} (${pendingCount} pending, ${declinedCount} auto-declined)`,
      );
    }

    return NextResponse.json({
      recurringGroupId,
      total: created.count,
      pending: pendingCount,
      autoDeclined: declinedCount,
    });
  }

  // Single booking
  const conflict = await checkConflicts({
    venueId: data.venueId,
    bookingDate: new Date(data.bookingDate),
    startTime: data.startTime,
    endTime: data.endTime,
    pitchSectionMode: data.pitchSectionMode,
  });

  // Auto-decline if venue is closed
  const isClosureConflict = conflict.hasConflict && conflict.closureConflict;
  const venue = await prisma.venue.findUnique({
    where: { id: data.venueId },
    select: { name: true },
  });

  const booking = await prisma.booking.create({
    data: {
      teamId: data.teamId,
      venueId: data.venueId,
      bookingDate: new Date(data.bookingDate),
      startTime: data.startTime,
      endTime: data.endTime,
      bookingType: data.bookingType,
      status: isClosureConflict ? "declined" : "pending",
      declineReason: isClosureConflict
        ? `Auto-declined: ${venue?.name ?? "Venue"} is closed. ${conflict.closureConflict?.reason ?? ""}`
        : undefined,
      pitchSectionMode: data.pitchSectionMode,
      pitchSectionIndex: data.pitchSectionIndex,
      opponent: data.opponent,
      notes: data.notes,
      altVenueName: data.altVenueName,
      createdByType: session.role,
      createdById: session.id,
    },
    include: {
      team: { select: { name: true } },
      venue: { select: { name: true } },
    },
  });

  await logAudit({
    actorType: session.role as "team" | "admin",
    actorId: session.id,
    action: "booking_created",
    targetType: "booking",
    targetId: booking.id,
    details: { bookingType: data.bookingType, hasConflict: conflict.hasConflict },
  });

  // Send email + in-app notifications to admins for new pending requests
  if (booking.status === "pending") {
    const dateStr = new Date(data.bookingDate).toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });

    await notifyAdminsNewRequest({
      teamName: booking.team?.name ?? "Unknown",
      venueName: booking.venue.name,
      bookingDate: dateStr,
      startTime: data.startTime,
      endTime: data.endTime,
      bookingType: data.bookingType,
    });

    await notifyAllAdmins(
      "New Booking Request",
      `${booking.team?.name ?? "Unknown"} has requested ${booking.venue.name} on ${dateStr} (${data.startTime}–${data.endTime})`,
      booking.id,
    );
  }

  return NextResponse.json({
    booking,
    conflict: conflict.hasConflict ? conflict : null,
  });
}
