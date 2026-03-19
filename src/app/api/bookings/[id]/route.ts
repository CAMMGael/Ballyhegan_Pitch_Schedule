import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth-helpers";
import { approveDeclineSchema } from "@/lib/validators";
import { checkConflicts } from "@/lib/conflicts";
import { logAudit } from "@/lib/audit";
import { bookingSchema } from "@/lib/validators";
import {
  notifyTeamBookingApproved,
  notifyTeamBookingDeclined,
  notifyAdminsCancellation,
  notifyAdminsBookingUpdate,
  notifyTeamBookingCancelled,
  notifyBookingModified,
} from "@/lib/email";
import { createNotification, notifyAllAdmins } from "@/lib/notifications";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      team: { select: { name: true, contactEmail: true } },
      venue: { select: { name: true } },
    },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // Team users can only view their own bookings
  if (session.role === "team" && booking.teamId !== session.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(booking);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.booking.findUnique({
    where: { id },
    include: {
      team: { select: { name: true, contactEmail: true } },
      venue: { select: { name: true } },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // Build update data from allowed fields
  const updateData: Record<string, unknown> = {};
  if (body.venueId) updateData.venueId = body.venueId;
  if (body.bookingDate) updateData.bookingDate = new Date(body.bookingDate);
  if (body.startTime) updateData.startTime = body.startTime;
  if (body.endTime) updateData.endTime = body.endTime;
  if (body.bookingType) updateData.bookingType = body.bookingType;
  if (body.pitchSectionMode) updateData.pitchSectionMode = body.pitchSectionMode;
  if (body.opponent !== undefined) updateData.opponent = body.opponent || null;
  if (body.notes !== undefined) updateData.notes = body.notes || null;
  if (body.altVenueName !== undefined) updateData.altVenueName = body.altVenueName || null;

  // Re-check conflicts with new details
  const conflict = await checkConflicts({
    venueId: (updateData.venueId as string) ?? existing.venueId,
    bookingDate: (updateData.bookingDate as Date) ?? existing.bookingDate,
    startTime: (updateData.startTime as string) ?? existing.startTime,
    endTime: (updateData.endTime as string) ?? existing.endTime,
    pitchSectionMode: (updateData.pitchSectionMode as string) ?? existing.pitchSectionMode,
    excludeBookingId: id,
  });

  const updated = await prisma.booking.update({
    where: { id },
    data: updateData,
    include: {
      team: { select: { name: true, contactEmail: true } },
      venue: { select: { name: true } },
    },
  });

  await logAudit({
    actorType: "admin",
    actorId: session.id,
    action: "booking_modified",
    targetType: "booking",
    targetId: id,
    details: { fields: Object.keys(updateData), hasConflict: conflict.hasConflict },
  });

  // Notify team and admins of modification
  const dateStr = updated.bookingDate.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });

  await notifyBookingModified({
    teamEmail: updated.team?.contactEmail,
    teamName: updated.team?.name ?? "Unknown",
    venueName: updated.venue.name,
    bookingDate: dateStr,
    startTime: updated.startTime,
    endTime: updated.endTime,
    modifiedBy: session.name,
  });

  if (updated.teamId) {
    await createNotification({
      recipientType: "team",
      recipientTeamId: updated.teamId,
      title: "Booking Modified",
      body: `Your booking at ${updated.venue.name} on ${dateStr} (${updated.startTime}–${updated.endTime}) has been modified by ${session.name}.`,
      relatedBookingId: id,
    });
  }

  await notifyAllAdmins(
    "Booking Modified",
    `${updated.team?.name ?? "Unknown"} booking at ${updated.venue.name} on ${dateStr} (${updated.startTime}–${updated.endTime}) was modified by ${session.name}.`,
    id,
  );

  return NextResponse.json({
    booking: updated,
    conflict: conflict.hasConflict ? conflict : null,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = approveDeclineSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { status, declineReason } = parsed.data;

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { team: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // Team users can only cancel their own bookings
  if (session.role === "team") {
    if (status !== "cancelled") {
      return NextResponse.json(
        { error: "Teams can only cancel bookings" },
        { status: 403 }
      );
    }
    if (booking.teamId !== session.id) {
      return NextResponse.json(
        { error: "You can only cancel your own bookings" },
        { status: 403 }
      );
    }
  }

  // Re-check conflicts at approval time
  if (status === "approved") {
    const conflict = await checkConflicts({
      venueId: booking.venueId,
      bookingDate: booking.bookingDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      pitchSectionMode: booking.pitchSectionMode,
      excludeBookingId: booking.id,
    });

    if (conflict.hasConflict) {
      return NextResponse.json(
        {
          error: "Cannot approve: conflicts detected",
          conflict,
        },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: {
      status,
      declineReason: status === "declined" ? declineReason : undefined,
      approvedById: status === "approved" ? session.id : undefined,
    },
    include: {
      team: { select: { name: true } },
      venue: { select: { name: true } },
    },
  });

  await logAudit({
    actorType: session.role as "team" | "admin",
    actorId: session.id,
    action: `booking_${status}`,
    targetType: "booking",
    targetId: id,
    details: { declineReason },
  });

  // Send email + in-app notifications
  const dateStr = booking.bookingDate.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });

  if (status === "approved" && booking.team) {
    // Notify team
    await notifyTeamBookingApproved({
      teamEmail: booking.team.contactEmail,
      teamName: booking.team.name,
      venueName: updated.venue.name,
      bookingDate: dateStr,
      startTime: booking.startTime,
      endTime: booking.endTime,
    });

    if (booking.teamId) {
      await createNotification({
        recipientType: "team",
        recipientTeamId: booking.teamId,
        title: "Booking Approved",
        body: `Your booking at ${updated.venue.name} on ${dateStr} (${booking.startTime}–${booking.endTime}) has been approved.`,
        relatedBookingId: id,
      });
    }

    // Notify all admins so they know it's been handled
    await notifyAdminsBookingUpdate({
      teamName: booking.team.name,
      venueName: updated.venue.name,
      bookingDate: dateStr,
      startTime: booking.startTime,
      endTime: booking.endTime,
      action: "approved",
      actionBy: session.name,
    });
    await notifyAllAdmins(
      "Booking Approved",
      `${booking.team.name} booking at ${updated.venue.name} on ${dateStr} (${booking.startTime}–${booking.endTime}) was approved by ${session.name}.`,
      id,
    );
  }

  if (status === "declined" && booking.team) {
    // Notify team
    await notifyTeamBookingDeclined({
      teamEmail: booking.team.contactEmail,
      teamName: booking.team.name,
      venueName: updated.venue.name,
      bookingDate: dateStr,
      startTime: booking.startTime,
      endTime: booking.endTime,
      reason: declineReason,
    });

    if (booking.teamId) {
      await createNotification({
        recipientType: "team",
        recipientTeamId: booking.teamId,
        title: "Booking Declined",
        body: `Your booking at ${updated.venue.name} on ${dateStr} (${booking.startTime}–${booking.endTime}) has been declined.${declineReason ? ` Reason: ${declineReason}` : ""}`,
        relatedBookingId: id,
      });
    }

    // Notify all admins so they know it's been handled
    await notifyAdminsBookingUpdate({
      teamName: booking.team.name,
      venueName: updated.venue.name,
      bookingDate: dateStr,
      startTime: booking.startTime,
      endTime: booking.endTime,
      action: "declined",
      actionBy: session.name,
      reason: declineReason,
    });
    await notifyAllAdmins(
      "Booking Declined",
      `${booking.team.name} booking at ${updated.venue.name} on ${dateStr} (${booking.startTime}–${booking.endTime}) was declined by ${session.name}.${declineReason ? ` Reason: ${declineReason}` : ""}`,
      id,
    );
  }

  if (status === "cancelled") {
    if (session.role === "team") {
      // Team cancelled their own booking — notify admins
      await notifyAdminsCancellation({
        teamName: booking.team?.name ?? "Unknown",
        venueName: updated.venue.name,
        bookingDate: dateStr,
        startTime: booking.startTime,
        endTime: booking.endTime,
      });
    } else {
      // Admin cancelled a booking — notify the team
      await notifyTeamBookingCancelled({
        teamEmail: booking.team?.contactEmail,
        teamName: booking.team?.name ?? "Unknown",
        venueName: updated.venue.name,
        bookingDate: dateStr,
        startTime: booking.startTime,
        endTime: booking.endTime,
        cancelledBy: session.name,
      });

      if (booking.teamId) {
        await createNotification({
          recipientType: "team",
          recipientTeamId: booking.teamId,
          title: "Booking Cancelled by Admin",
          body: `Your booking at ${updated.venue.name} on ${dateStr} (${booking.startTime}–${booking.endTime}) has been cancelled by ${session.name}.`,
          relatedBookingId: id,
        });
      }

      // Notify other admins
      await notifyAdminsBookingUpdate({
        teamName: booking.team?.name ?? "Unknown",
        venueName: updated.venue.name,
        bookingDate: dateStr,
        startTime: booking.startTime,
        endTime: booking.endTime,
        action: "cancelled",
        actionBy: session.name,
      });
      await notifyAllAdmins(
        "Booking Cancelled",
        `${booking.team?.name ?? "Unknown"} booking at ${updated.venue.name} on ${dateStr} (${booking.startTime}–${booking.endTime}) was cancelled by ${session.name}.`,
        id,
      );
    }
  }

  return NextResponse.json(updated);
}
