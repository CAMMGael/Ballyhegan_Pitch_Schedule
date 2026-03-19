"use client";

import { useEffect, useState } from "react";

interface Booking {
  id: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  bookingType: string;
  status: string;
  pitchSectionMode: string;
  opponent: string | null;
  notes: string | null;
  recurringGroupId: string | null;
  team: { name: string } | null;
  venue: { name: string };
}

export default function RequestsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [declineReason, setDeclineReason] = useState("");
  const [showDeclineModal, setShowDeclineModal] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadBookings();
  }, []);

  async function loadBookings() {
    setLoading(true);
    const res = await fetch("/api/bookings?status=pending");
    const data = await res.json();
    setBookings(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === bookings.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(bookings.map((b) => b.id)));
    }
  }

  async function handleAction(id: string, status: "approved" | "declined", reason?: string) {
    setActionLoading(true);
    const res = await fetch(`/api/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, declineReason: reason }),
    });

    if (res.ok) {
      setBookings((prev) => prev.filter((b) => b.id !== id));
      setShowDeclineModal(null);
      setDeclineReason("");
    } else {
      const data = await res.json();
      alert(data.error || "Action failed");
    }
    setActionLoading(false);
  }

  async function handleBulkAction(status: "approved" | "declined") {
    if (selected.size === 0) return;

    if (status === "declined" && !declineReason) {
      const reason = prompt("Enter decline reason (optional):");
      if (reason !== null) {
        setDeclineReason(reason);
      }
    }

    setActionLoading(true);
    const res = await fetch("/api/bookings/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingIds: Array.from(selected),
        status,
        declineReason: status === "declined" ? declineReason : undefined,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      setBookings((prev) => prev.filter((b) => !selected.has(b.id)));
      setSelected(new Set());
      setDeclineReason("");
      if (result.failed > 0) {
        alert(`${result.successful} succeeded, ${result.failed} failed (conflicts detected)`);
      }
    }
    setActionLoading(false);
  }

  // Group by recurring group
  const recurringGroups = new Map<string, Booking[]>();
  const standaloneBookings: Booking[] = [];

  for (const booking of bookings) {
    if (booking.recurringGroupId) {
      const group = recurringGroups.get(booking.recurringGroupId) ?? [];
      group.push(booking);
      recurringGroups.set(booking.recurringGroupId, group);
    } else {
      standaloneBookings.push(booking);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Booking Requests
      </h1>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : bookings.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No pending requests.</p>
        </div>
      ) : (
        <>
          {/* Bulk actions */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              onClick={selectAll}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {selected.size === bookings.length ? "Deselect All" : "Select All"}
            </button>
            {selected.size > 0 && (
              <>
                <span className="text-sm text-gray-500">
                  {selected.size} selected
                </span>
                <button
                  onClick={() => handleBulkAction("approved")}
                  disabled={actionLoading}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Approve Selected
                </button>
                <button
                  onClick={() => handleBulkAction("declined")}
                  disabled={actionLoading}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Decline Selected
                </button>
              </>
            )}
          </div>

          {/* Booking list */}
          <div className="space-y-3">
            {bookings.map((booking) => (
              <div
                key={booking.id}
                className={`rounded-lg border bg-white p-4 ${
                  selected.has(booking.id) ? "border-primary-500 ring-1 ring-primary-500" : "border-gray-200"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(booking.id)}
                    onChange={() => toggleSelect(booking.id)}
                    className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {booking.team?.name ?? "Unknown"}
                      </span>
                      <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 capitalize">
                        {booking.bookingType}
                      </span>
                      {booking.recurringGroupId && (
                        <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-600">
                          Recurring
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {new Date(booking.bookingDate).toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      | {booking.startTime} - {booking.endTime} |{" "}
                      {booking.venue.name}
                      {booking.pitchSectionMode !== "full" &&
                        ` (${booking.pitchSectionMode})`}
                    </p>
                    {booking.opponent && (
                      <p className="text-sm text-gray-500">
                        vs {booking.opponent}
                      </p>
                    )}
                    {booking.notes && (
                      <p className="text-sm text-gray-400 mt-1">
                        {booking.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(booking.id, "approved")}
                      disabled={actionLoading}
                      className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setShowDeclineModal(booking.id)}
                      disabled={actionLoading}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Decline modal */}
          {showDeclineModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Decline Booking
                </h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason (optional)
                  </label>
                  <textarea
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    rows={3}
                    placeholder="Enter reason for declining..."
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <div className="mt-4 flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowDeclineModal(null);
                      setDeclineReason("");
                    }}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() =>
                      handleAction(showDeclineModal, "declined", declineReason)
                    }
                    disabled={actionLoading}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
