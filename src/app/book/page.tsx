"use client";

import { useSession } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PublicCalendar } from "@/components/calendar/PublicCalendar";

interface Venue {
  id: string;
  name: string;
  slug: string;
  splitConfig: {
    allowed_splits: string[];
    labels: Record<string, string>;
  } | null;
  isFreeText: boolean;
}

interface Team {
  id: string;
  name: string;
  slug: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

function generateTimeOptions(): string[] {
  const times: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      times.push(
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
      );
    }
  }
  return times;
}

const TIME_OPTIONS = generateTimeOptions();

export default function BookPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><p className="text-sm text-gray-500">Loading...</p></div>}>
      <BookPage />
    </Suspense>
  );
}

function BookPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const user = session?.user as Record<string, unknown> | undefined;
  const role = user?.role as string;

  const [venues, setVenues] = useState<Venue[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingBooking, setLoadingBooking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Form state
  const [teamId, setTeamId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState("20:00");
  const [bookingType, setBookingType] = useState("training");
  const [pitchSectionMode, setPitchSectionMode] = useState("full");
  const [opponent, setOpponent] = useState("");
  const [notes, setNotes] = useState("");
  const [altVenueName, setAltVenueName] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDay, setRecurringDay] = useState(2); // Tuesday
  const [recurringStartDate, setRecurringStartDate] = useState("");
  const [recurringEndDate, setRecurringEndDate] = useState("");

  useEffect(() => {
    fetch("/api/venues")
      .then((r) => r.json())
      .then(setVenues)
      .catch(console.error);

    if (role === "admin") {
      fetch("/api/teams")
        .then((r) => r.json())
        .then(setTeams)
        .catch(console.error);
    }
  }, [role]);

  // Auto-set team for team users
  useEffect(() => {
    if (role === "team" && user?.id && !isEditMode) {
      setTeamId(user.id as string);
    }
  }, [role, user, isEditMode]);

  // Load existing booking when editing
  useEffect(() => {
    if (!editId || !role) return;

    setLoadingBooking(true);
    setIsEditMode(true);

    fetch(`/api/bookings/${editId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load booking");
        return r.json();
      })
      .then((booking) => {
        setTeamId(booking.teamId || "");
        setVenueId(booking.venueId);
        setBookingDate(booking.bookingDate.split("T")[0]);
        setStartTime(booking.startTime);
        setEndTime(booking.endTime);
        setBookingType(booking.bookingType);
        setPitchSectionMode(booking.pitchSectionMode);
        setOpponent(booking.opponent || "");
        setNotes(booking.notes || "");
        setAltVenueName(booking.altVenueName || "");
        setLoadingBooking(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load booking");
        setLoadingBooking(false);
      });
  }, [editId, role]);

  const selectedVenue = venues.find((v) => v.id === venueId);
  const splitOptions = selectedVenue?.splitConfig?.allowed_splits ?? [];
  const splitLabels = selectedVenue?.splitConfig?.labels ?? {};

  // Auto-set match defaults
  useEffect(() => {
    if (bookingType === "match" && startTime) {
      // Default 3-hour match booking
      const [h, m] = startTime.split(":").map(Number);
      const endMinutes = h * 60 + m + 180;
      const endH = Math.floor(endMinutes / 60) % 24;
      const endM = endMinutes % 60;
      setEndTime(
        `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`
      );
      setPitchSectionMode("full");
    }
  }, [bookingType, startTime]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const payload: Record<string, unknown> = {
      teamId,
      venueId,
      bookingDate,
      startTime,
      endTime,
      bookingType,
      pitchSectionMode,
      pitchSectionIndex: 1,
      opponent: bookingType === "match" ? opponent : undefined,
      notes: notes || undefined,
      altVenueName: selectedVenue?.isFreeText ? altVenueName : undefined,
    };

    if (isEditMode && editId) {
      // Update existing booking
      const res = await fetch(`/api/bookings/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setError(data.error || "Failed to update booking");
        return;
      }

      if (data.conflict) {
        setSuccess("Booking updated. Note: a conflict was detected — please review.");
      } else {
        setSuccess("Booking updated successfully. Team and admins have been notified.");
      }
      return;
    }

    if (isRecurring) {
      payload.recurring = {
        dayOfWeek: recurringDay,
        startDate: recurringStartDate,
        endDate: recurringEndDate,
      };
    }

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Failed to create booking");
      return;
    }

    if (data.recurringGroupId) {
      setSuccess(
        `Recurring booking created: ${data.pending} pending, ${data.autoDeclined} auto-declined due to conflicts.`
      );
    } else if (data.conflict) {
      setSuccess(
        "Booking request submitted. Note: a conflict was detected — the admin will review."
      );
    } else {
      setSuccess("Booking request submitted successfully. Awaiting admin approval.");
    }

    // Reset form
    setBookingDate("");
    setOpponent("");
    setNotes("");
    setAltVenueName("");
    setIsRecurring(false);
  }

  if (loadingBooking) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-gray-500">Loading booking...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditMode ? "Edit Booking" : "Book a Venue"}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isEditMode
              ? "Modify the booking details below. Team and admins will be notified of changes."
              : "Submit a booking request for approval."}
          </p>
        </div>
        <button
          onClick={() => setShowCalendar(!showCalendar)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          {showCalendar ? "Hide Calendar" : "View Calendar"}
        </button>
      </div>

      {showCalendar && (
        <div className="mb-6">
          <PublicCalendar includeAll />
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 max-w-2xl"
      >
        <div className="space-y-4">
          {/* Team selector (admin only) */}
          {role === "admin" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Team *
              </label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              >
                <option value="">Select team...</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Team display (team users) */}
          {role === "team" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Team
              </label>
              <p className="text-sm text-gray-600">{user?.name as string}</p>
            </div>
          )}

          {/* Venue */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Venue *
            </label>
            <select
              value={venueId}
              onChange={(e) => {
                setVenueId(e.target.value);
                setPitchSectionMode("full");
              }}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
            >
              <option value="">Select venue...</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          {/* Alternative venue name */}
          {selectedVenue?.isFreeText && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Venue Name *
              </label>
              <input
                type="text"
                value={altVenueName}
                onChange={(e) => setAltVenueName(e.target.value)}
                placeholder="Enter venue name"
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>
          )}

          {/* Booking Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type *
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  value="training"
                  checked={bookingType === "training"}
                  onChange={(e) => setBookingType(e.target.value)}
                  className="text-accent-500 focus:ring-accent-500"
                />
                Training
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  value="match"
                  checked={bookingType === "match"}
                  onChange={(e) => setBookingType(e.target.value)}
                  className="text-accent-500 focus:ring-accent-500"
                />
                Match
              </label>
            </div>
          </div>

          {/* Pitch section (if venue supports splitting) */}
          {splitOptions.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pitch Section *
              </label>
              <select
                value={pitchSectionMode}
                onChange={(e) => setPitchSectionMode(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              >
                {splitOptions.map((split) => (
                  <option key={split} value={split}>
                    {splitLabels[split] ?? split}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Recurring toggle (hidden in edit mode) */}
          {!isEditMode && (
            <div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="rounded border-gray-300 text-accent-500 focus:ring-accent-500"
                />
                Recurring booking
              </label>
            </div>
          )}

          {isRecurring ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Day of Week *
                </label>
                <select
                  value={recurringDay}
                  onChange={(e) => setRecurringDay(Number(e.target.value))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={recurringStartDate}
                    onChange={(e) => setRecurringStartDate(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={recurringEndDate}
                    onChange={(e) => setRecurringEndDate(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                  />
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date *
              </label>
              <input
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>
          )}

          {/* Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time *
              </label>
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Time *
              </label>
              <select
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick duration buttons */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quick Duration
            </label>
            <div className="flex gap-2">
              {[60, 90, 180].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => {
                    const [h, m] = startTime.split(":").map(Number);
                    const endMins = h * 60 + m + mins;
                    const endH = Math.floor(endMins / 60) % 24;
                    const endM = endMins % 60;
                    setEndTime(
                      `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`
                    );
                  }}
                  className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  {mins === 60
                    ? "1 hour"
                    : mins === 90
                      ? "90 min"
                      : "3 hours (match)"}
                </button>
              ))}
            </div>
          </div>

          {/* Opponent (match only) */}
          {bookingType === "match" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Opponent *
              </label>
              <input
                type="text"
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                placeholder="Opponent team name"
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional information..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
            />
          </div>

          {/* Messages */}
          {error && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          {success && (
            <div className="rounded-md bg-green-50 p-3">
              <p className="text-sm text-green-700">{success}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary-800 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? (isEditMode ? "Updating..." : "Submitting...")
              : (isEditMode ? "Update Booking" : "Submit Booking Request")}
          </button>
        </div>
      </form>
    </div>
  );
}
