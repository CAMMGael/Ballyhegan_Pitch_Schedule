import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { bulkActionSchema } from "@/lib/validators";
import { checkConflicts } from "@/lib/conflicts";
import { logAudit } from "@/lib/audit";
import {
  notifyTeamBookingApproved,
  notifyTeamBookingDeclined,
} from "@/lib/email";
import { createNotification } from "@/lib/notifications";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();

  const body = await req.json();
  const parsed = bulkActionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { bookingIds, status, declineReason } = parsed.data;

  const results: Array<{
    id: string;
    success: boolean;
    error?: string;
  }> = [];

  for (const bookingId of bookingIds) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        team: { select: { name: true, contactEmail: true } },
        venue: { select: { name: true } },
      },
    });

    if (!booking) {
      results.push({ id: bookingId, success: false, error: "Not found" });
      continue;
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
        results.push({
          id: bookingId,
          success: false,
          error: "Conflict detected",
        });
        continue;
      }
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status,
        declineReason: status === "declined" ? declineReason : undefined,
        approvedById: status === "approved" ? session.id : undefined,
      },
    });

    await logAudit({
      actorType: "admin",
      actorId: session.id,
      action: `booking_${status}`,
      targetType: "booking",
      targetId: bookingId,
      details: { bulk: true, declineReason },
    });

    // Send notifications
    const dateStr = booking.bookingDate.toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });

    if (status === "approved" && booking.team) {
      await notifyTeamBookingApproved({
        teamEmail: booking.team.contactEmail,
        teamName: booking.team.name,
        venueName: booking.venue.name,
        bookingDate: dateStr,
        startTime: booking.startTime,
        endTime: booking.endTime,
      });

      if (booking.teamId) {
        await createNotification({
          recipientType: "team",
          recipientTeamId: booking.teamId,
          title: "Booking Approved",
          body: `Your booking at ${booking.venue.name} on ${dateStr} (${booking.startTime}–${booking.endTime}) has been approved.`,
          relatedBookingId: bookingId,
        });
      }
    }

    if (status === "declined" && booking.team) {
      await notifyTeamBookingDeclined({
        teamEmail: booking.team.contactEmail,
        teamName: booking.team.name,
        venueName: booking.venue.name,
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
          body: `Your booking at ${booking.venue.name} on ${dateStr} (${booking.startTime}–${booking.endTime}) has been declined.${declineReason ? ` Reason: ${declineReason}` : ""}`,
          relatedBookingId: bookingId,
        });
      }
    }

    results.push({ id: bookingId, success: true });
  }

  return NextResponse.json({
    total: results.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
}
