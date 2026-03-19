export type BookingType = "training" | "match" | "fixture_import";
export type BookingStatus = "pending" | "approved" | "declined" | "cancelled";
export type PitchSectionMode = "full" | "half" | "third" | "quarter";
export type UserRole = "admin" | "team";

export interface SessionUser {
  id: string;
  role: UserRole;
  name: string;
  teamSlug?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: {
    bookingType: BookingType | "closed";
    status: BookingStatus;
    teamName?: string;
    opponent?: string;
    venueName: string;
    pitchSection?: string;
    notes?: string;
  };
}

export interface SplitConfig {
  max_units: number;
  allowed_splits: PitchSectionMode[];
  labels: Record<string, string>;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflictingBookings: Array<{
    id: string;
    teamName: string;
    startTime: string;
    endTime: string;
    pitchSectionMode: string;
  }>;
  closureConflict?: {
    reason?: string;
  };
}
