export const BOOKING_TYPES = {
  TRAINING: "training",
  MATCH: "match",
  FIXTURE_IMPORT: "fixture_import",
} as const;

export const BOOKING_STATUSES = {
  PENDING: "pending",
  APPROVED: "approved",
  DECLINED: "declined",
  CANCELLED: "cancelled",
} as const;

export const PITCH_SECTION_MODES = {
  FULL: "full",
  HALF: "half",
  THIRD: "third",
  QUARTER: "quarter",
} as const;

export const PITCH_MODE_UNITS: Record<string, number> = {
  full: 1,
  half: 2,
  third: 3,
  quarter: 4,
};

export const ROLES = {
  ADMIN: "admin",
  TEAM: "team",
} as const;

export const BOOKING_TYPE_COLOURS: Record<string, string> = {
  training: "#22c55e",
  match: "#1E73BE",
  fixture_import: "#f97316",
  closed: "#ef4444",
};

export const BOOKING_TYPE_LABELS: Record<string, string> = {
  training: "Training",
  match: "Match",
  fixture_import: "Fixture",
};
