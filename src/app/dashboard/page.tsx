"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

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
  declineReason: string | null;
  venue: { name: string };
  team: { name: string } | null;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const user = session?.user as Record<string, unknown> | undefined;
  const role = user?.role as string;
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/bookings")
      .then((r) => r.json())
      .then((data) => {
        setBookings(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const statusColour: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    declined: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-800",
  };

  async function handleCancel(bookingId: string) {
    if (!confirm("Are you sure you want to cancel this booking?")) return;

    const res = await fetch(`/api/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });

    if (res.ok) {
      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId ? { ...b, status: "cancelled" } : b
        )
      );
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Welcome, {user?.name as string}
          </p>
        </div>
        <Link
          href="/book"
          className="rounded-md bg-primary-800 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-950"
        >
          New Booking
        </Link>
      </div>

      {role === "admin" && (
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href="/admin/requests"
            className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 hover:bg-yellow-100"
          >
            <h3 className="font-semibold text-yellow-800">Pending Requests</h3>
            <p className="text-sm text-yellow-600">Review and approve bookings</p>
          </Link>
          <Link
            href="/admin/teams"
            className="rounded-lg border border-blue-200 bg-blue-50 p-4 hover:bg-blue-100"
          >
            <h3 className="font-semibold text-blue-800">Manage Teams</h3>
            <p className="text-sm text-blue-600">Add, edit, or reset team accounts</p>
          </Link>
          <Link
            href="/admin/venues"
            className="rounded-lg border border-purple-200 bg-purple-50 p-4 hover:bg-purple-100"
          >
            <h3 className="font-semibold text-purple-800">Venue Closures</h3>
            <p className="text-sm text-purple-600">Manage venue availability</p>
          </Link>
        </div>
      )}

      <h2 className="text-lg font-semibold text-gray-900 mb-3">
        {role === "admin" ? "All Bookings" : "My Bookings"}
      </h2>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : bookings.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No bookings yet.</p>
          <Link
            href="/book"
            className="mt-2 inline-block text-sm text-accent-500 hover:text-primary-950"
          >
            Make your first booking
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <div
              key={booking.id}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {booking.team?.name ?? "Unknown"}
                    </span>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColour[booking.status]}`}
                    >
                      {booking.status}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">
                      {booking.bookingType.replace("_", " ")}
                    </span>
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
                  {booking.declineReason && (
                    <p className="text-sm text-red-600 mt-1">
                      Reason: {booking.declineReason}
                    </p>
                  )}
                  {booking.notes && (
                    <p className="text-sm text-gray-400 mt-1">
                      {booking.notes}
                    </p>
                  )}
                </div>
                {(booking.status === "approved" ||
                  booking.status === "pending") && (
                  <button
                    onClick={() => handleCancel(booking.id)}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
