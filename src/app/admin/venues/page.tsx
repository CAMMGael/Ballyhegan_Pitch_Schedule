"use client";

import { useEffect, useState, useCallback } from "react";

interface Venue {
  id: string;
  name: string;
  slug: string;
  hasFloodlights: boolean;
  surfaceType: string | null;
}

interface VenueClosure {
  id: string;
  venueId: string;
  closedDate: string;
  closedDateEnd: string | null;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  createdAt: string;
}

export default function VenueClosuresPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [closures, setClosures] = useState<Record<string, VenueClosure[]>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [closedDate, setClosedDate] = useState("");
  const [closedDateEnd, setClosedDateEnd] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [isDateRange, setIsDateRange] = useState(false);

  // Expanded venue sections
  const [expandedVenues, setExpandedVenues] = useState<Set<string>>(new Set());

  const loadVenues = useCallback(async () => {
    const res = await fetch("/api/venues");
    if (res.ok) {
      const data: Venue[] = await res.json();
      setVenues(data);
      if (data.length > 0 && !selectedVenueId) {
        setSelectedVenueId(data[0].id);
      }
    }
  }, [selectedVenueId]);

  const loadClosures = useCallback(async (venueId: string) => {
    const res = await fetch(`/api/venues/${venueId}/closures`);
    if (res.ok) {
      const data: VenueClosure[] = await res.json();
      setClosures((prev) => ({ ...prev, [venueId]: data }));
    }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await loadVenues();
      setLoading(false);
    }
    init();
  }, [loadVenues]);

  useEffect(() => {
    for (const venue of venues) {
      loadClosures(venue.id);
    }
  }, [venues, loadClosures]);

  function toggleVenue(venueId: string) {
    setExpandedVenues((prev) => {
      const next = new Set(prev);
      if (next.has(venueId)) next.delete(venueId);
      else next.add(venueId);
      return next;
    });
  }

  function clearForm() {
    setClosedDate("");
    setClosedDateEnd("");
    setStartTime("");
    setEndTime("");
    setReason("");
    setIsDateRange(false);
  }

  function showSuccess(message: string) {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedVenueId || !closedDate) {
      setError("Please select a venue and date.");
      return;
    }

    if ((startTime && !endTime) || (!startTime && endTime)) {
      setError("Both start and end time are required for hourly closures.");
      return;
    }

    if (startTime && endTime && startTime >= endTime) {
      setError("Start time must be before end time.");
      return;
    }

    if (isDateRange && closedDateEnd && closedDateEnd < closedDate) {
      setError("End date must be on or after start date.");
      return;
    }

    setSubmitting(true);

    const body: Record<string, string> = { closedDate };
    if (isDateRange && closedDateEnd) body.closedDateEnd = closedDateEnd;
    if (startTime) body.startTime = startTime;
    if (endTime) body.endTime = endTime;
    if (reason.trim()) body.reason = reason.trim();

    const res = await fetch(`/api/venues/${selectedVenueId}/closures`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      clearForm();
      await loadClosures(selectedVenueId);
      setExpandedVenues((prev) => new Set(prev).add(selectedVenueId));
      showSuccess("Closure added successfully.");
    } else {
      const data = await res.json();
      setError(data.error || "Failed to create closure.");
    }

    setSubmitting(false);
  }

  async function handleDelete(venueId: string, closureId: string) {
    if (!confirm("Remove this closure?")) return;

    const res = await fetch(
      `/api/venues/${venueId}/closures?closureId=${closureId}`,
      { method: "DELETE" }
    );

    if (res.ok) {
      await loadClosures(venueId);
      showSuccess("Closure removed.");
    } else {
      const data = await res.json();
      alert(data.error || "Failed to delete closure.");
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-gray-500">Loading venues...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Venue Closures
      </h1>

      {/* Add Closure Form */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Add Closure
        </h2>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Venue */}
            <div>
              <label
                htmlFor="venue"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Venue
              </label>
              <select
                id="venue"
                value={selectedVenueId}
                onChange={(e) => setSelectedVenueId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              >
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label
                htmlFor="closedDate"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {isDateRange ? "Start Date" : "Date"}
              </label>
              <input
                id="closedDate"
                type="date"
                value={closedDate}
                onChange={(e) => setClosedDate(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>
          </div>

          {/* Date range toggle */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isDateRange}
              onChange={(e) => {
                setIsDateRange(e.target.checked);
                if (!e.target.checked) setClosedDateEnd("");
              }}
              className="rounded border-gray-300 text-accent-500 focus:ring-accent-500"
            />
            Extended closure (multiple days)
          </label>

          {/* End Date (shown when date range is enabled) */}
          {isDateRange && (
            <div className="max-w-xs">
              <label
                htmlFor="closedDateEnd"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                End Date
              </label>
              <input
                id="closedDateEnd"
                type="date"
                value={closedDateEnd}
                onChange={(e) => setClosedDateEnd(e.target.value)}
                min={closedDate}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Start Time */}
            <div>
              <label
                htmlFor="startTime"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Start Time{" "}
                <span className="text-gray-400 font-normal">
                  (optional, for hourly closure)
                </span>
              </label>
              <input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>

            {/* End Time */}
            <div>
              <label
                htmlFor="endTime"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                End Time{" "}
                <span className="text-gray-400 font-normal">
                  (optional, for hourly closure)
                </span>
              </label>
              <input
                id="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label
              htmlFor="reason"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Reason{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Pitch maintenance, Frostbite Cup finals"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-primary-800 px-4 py-2 text-sm font-medium text-white hover:bg-primary-950 disabled:opacity-50"
            >
              {submitting ? "Adding..." : "Add Closure"}
            </button>
          </div>
        </form>
      </div>

      {/* Venue List with Closures */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Venues &amp; Closures
      </h2>

      {venues.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No venues configured.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {venues.map((venue) => {
            const venueClosures = closures[venue.id] ?? [];
            const isExpanded = expandedVenues.has(venue.id);
            const today = new Date(new Date().toDateString());
            const futureClosures = venueClosures.filter((c) => {
              const end = c.closedDateEnd ? new Date(c.closedDateEnd) : new Date(c.closedDate);
              return end >= today;
            });

            return (
              <div
                key={venue.id}
                className="rounded-lg border border-gray-200 bg-white overflow-hidden"
              >
                {/* Venue header */}
                <button
                  type="button"
                  onClick={() => toggleVenue(venue.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-900">
                      {venue.name}
                    </span>
                    {venue.surfaceType && (
                      <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {venue.surfaceType}
                      </span>
                    )}
                    {venue.hasFloodlights && (
                      <span className="inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                        Floodlights
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {futureClosures.length > 0 && (
                      <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        {futureClosures.length} closure{futureClosures.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    <svg
                      className={`h-5 w-5 text-gray-400 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m19.5 8.25-7.5 7.5-7.5-7.5"
                      />
                    </svg>
                  </div>
                </button>

                {/* Closures list */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-3">
                    {venueClosures.length === 0 ? (
                      <p className="text-sm text-gray-400 py-2">
                        No closures for this venue.
                      </p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {venueClosures.map((closure) => {
                          const closureEndDate = closure.closedDateEnd
                            ? new Date(closure.closedDateEnd)
                            : new Date(closure.closedDate);
                          const isPast =
                            closureEndDate < new Date(new Date().toDateString());

                          return (
                            <div
                              key={closure.id}
                              className={`flex items-center justify-between py-2 ${
                                isPast ? "opacity-50" : ""
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                  <span className="font-medium text-gray-900">
                                    {formatDate(closure.closedDate)}
                                    {closure.closedDateEnd &&
                                      closure.closedDateEnd !== closure.closedDate &&
                                      ` — ${formatDate(closure.closedDateEnd)}`}
                                  </span>
                                  {closure.startTime && closure.endTime ? (
                                    <span className="text-gray-600">
                                      {closure.startTime} - {closure.endTime}
                                    </span>
                                  ) : (
                                    <span className="inline-block rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                                      All Day
                                    </span>
                                  )}
                                  {isPast && (
                                    <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                                      Past
                                    </span>
                                  )}
                                </div>
                                {closure.reason && (
                                  <p className="text-sm text-gray-500 mt-0.5 truncate">
                                    {closure.reason}
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() =>
                                  handleDelete(venue.id, closure.id)
                                }
                                className="ml-3 shrink-0 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                              >
                                Remove
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
