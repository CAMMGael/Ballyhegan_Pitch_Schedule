import { prisma } from "./db";
import { PITCH_MODE_UNITS } from "./constants";
import type { ConflictResult, SplitConfig } from "@/types";

interface ConflictCheckParams {
  venueId: string;
  bookingDate: Date;
  startTime: string;
  endTime: string;
  pitchSectionMode: string;
  excludeBookingId?: string;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  return s1 < e2 && s2 < e1;
}

export async function checkConflicts(
  params: ConflictCheckParams
): Promise<ConflictResult> {
  const { venueId, bookingDate, startTime, endTime, pitchSectionMode, excludeBookingId } = params;

  // Check venue closures (including date range closures)
  const closures = await prisma.venueClosure.findMany({
    where: {
      venueId,
      closedDate: { lte: bookingDate },
      OR: [
        { closedDateEnd: { gte: bookingDate } },
        { closedDateEnd: null, closedDate: bookingDate },
      ],
    },
  });

  for (const closure of closures) {
    if (!closure.startTime || !closure.endTime) {
      // All-day closure (or multi-day all-day closure)
      return {
        hasConflict: true,
        conflictingBookings: [],
        closureConflict: { reason: closure.reason ?? "Venue closed" },
      };
    }
    if (timesOverlap(startTime, endTime, closure.startTime, closure.endTime)) {
      return {
        hasConflict: true,
        conflictingBookings: [],
        closureConflict: { reason: closure.reason ?? "Venue closed during this time" },
      };
    }
  }

  // Get venue split config
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { splitConfig: true },
  });

  const splitConfig = venue?.splitConfig as SplitConfig | null;

  // Get overlapping approved/pending bookings
  const overlapping = await prisma.booking.findMany({
    where: {
      venueId,
      bookingDate,
      status: { in: ["approved", "pending"] },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    include: {
      team: { select: { name: true } },
    },
  });

  const conflicting = overlapping.filter((booking) =>
    timesOverlap(startTime, endTime, booking.startTime, booking.endTime)
  );

  if (conflicting.length === 0) {
    return { hasConflict: false, conflictingBookings: [] };
  }

  // No split config = simple venue, any overlap is a conflict
  if (!splitConfig) {
    return {
      hasConflict: true,
      conflictingBookings: conflicting.map((b) => ({
        id: b.id,
        teamName: b.team?.name ?? "Unknown",
        startTime: b.startTime,
        endTime: b.endTime,
        pitchSectionMode: b.pitchSectionMode,
      })),
    };
  }

  // Check if new booking is full pitch — conflicts with anything
  if (pitchSectionMode === "full") {
    return {
      hasConflict: true,
      conflictingBookings: conflicting.map((b) => ({
        id: b.id,
        teamName: b.team?.name ?? "Unknown",
        startTime: b.startTime,
        endTime: b.endTime,
        pitchSectionMode: b.pitchSectionMode,
      })),
    };
  }

  // Check if any existing booking is full pitch
  const fullPitchBooking = conflicting.find((b) => b.pitchSectionMode === "full");
  if (fullPitchBooking) {
    return {
      hasConflict: true,
      conflictingBookings: [{
        id: fullPitchBooking.id,
        teamName: fullPitchBooking.team?.name ?? "Unknown",
        startTime: fullPitchBooking.startTime,
        endTime: fullPitchBooking.endTime,
        pitchSectionMode: fullPitchBooking.pitchSectionMode,
      }],
    };
  }

  // Check if mixing split modes
  const existingModes = new Set(conflicting.map((b) => b.pitchSectionMode));
  if (existingModes.size > 0 && !existingModes.has(pitchSectionMode)) {
    return {
      hasConflict: true,
      conflictingBookings: conflicting.map((b) => ({
        id: b.id,
        teamName: b.team?.name ?? "Unknown",
        startTime: b.startTime,
        endTime: b.endTime,
        pitchSectionMode: b.pitchSectionMode,
      })),
    };
  }

  // Same split mode — check capacity
  const maxUnits = PITCH_MODE_UNITS[pitchSectionMode] ?? 1;
  const usedUnits = conflicting.filter(
    (b) => b.pitchSectionMode === pitchSectionMode
  ).length;

  if (usedUnits + 1 > maxUnits) {
    return {
      hasConflict: true,
      conflictingBookings: conflicting.map((b) => ({
        id: b.id,
        teamName: b.team?.name ?? "Unknown",
        startTime: b.startTime,
        endTime: b.endTime,
        pitchSectionMode: b.pitchSectionMode,
      })),
    };
  }

  return { hasConflict: false, conflictingBookings: [] };
}
