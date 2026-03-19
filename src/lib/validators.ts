import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const bookingSchema = z.object({
  teamId: z.string().uuid(),
  venueId: z.string().uuid(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(timeRegex, "Must be HH:MM format"),
  endTime: z.string().regex(timeRegex, "Must be HH:MM format"),
  bookingType: z.enum(["training", "match"]),
  pitchSectionMode: z.enum(["full", "half", "third", "quarter"]).default("full"),
  pitchSectionIndex: z.number().int().min(1).default(1),
  opponent: z.string().optional(),
  notes: z.string().optional(),
  altVenueName: z.string().optional(),
  recurring: z
    .object({
      dayOfWeek: z.number().int().min(0).max(6),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .optional(),
});

export const approveDeclineSchema = z.object({
  status: z.enum(["approved", "declined", "cancelled"]),
  declineReason: z.string().optional(),
});

export const bulkActionSchema = z.object({
  bookingIds: z.array(z.string().uuid()),
  status: z.enum(["approved", "declined"]),
  declineReason: z.string().optional(),
});

export const venueClosureSchema = z.object({
  closedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  closedDateEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(timeRegex).optional(),
  endTime: z.string().regex(timeRegex).optional(),
  reason: z.string().optional(),
});

export type BookingInput = z.infer<typeof bookingSchema>;
export type ApproveDeclineInput = z.infer<typeof approveDeclineSchema>;
export type BulkActionInput = z.infer<typeof bulkActionSchema>;
export type VenueClosureInput = z.infer<typeof venueClosureSchema>;
