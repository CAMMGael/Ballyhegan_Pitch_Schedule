"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import type { CalendarEvent } from "@/types";

interface Venue {
  id: string;
  name: string;
  slug: string;
}

interface Team {
  id: string;
  name: string;
  slug: string;
}

interface PublicCalendarProps {
  includeAll?: boolean;
}

export function PublicCalendar({ includeAll = false }: PublicCalendarProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const calendarRef = useRef<FullCalendar>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedVenue, setSelectedVenue] = useState("all");
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [showTeamFilter, setShowTeamFilter] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Modal state for admin actions
  const [selectedEvent, setSelectedEvent] = useState<{
    id: string;
    title: string;
    venueName: string;
    teamName?: string;
    opponent?: string;
    pitchSection?: string;
    notes?: string;
    status: string;
    bookingType: string;
  } | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const user = session?.user as Record<string, unknown> | undefined;
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    fetch("/api/venues")
      .then((r) => r.json())
      .then(setVenues)
      .catch(console.error);
    fetch("/api/teams")
      .then((r) => r.json())
      .then(setTeams)
      .catch(console.error);
  }, []);

  const fetchEvents = useCallback(
    (
      info: { startStr: string; endStr: string },
      successCallback: (events: CalendarEvent[]) => void,
      failureCallback: (error: Error) => void
    ) => {
      const params = new URLSearchParams({
        start: info.startStr,
        end: info.endStr,
        ...(selectedVenue !== "all" ? { venueId: selectedVenue } : {}),
        ...(selectedTeams.length > 0
          ? { teamIds: selectedTeams.join(",") }
          : {}),
        ...(includeAll ? { includeAll: "true" } : {}),
      });

      fetch(`/api/calendar/events?${params}`)
        .then((r) => r.json())
        .then(successCallback)
        .catch(failureCallback);
    },
    [selectedVenue, selectedTeams, includeAll]
  );

  useEffect(() => {
    calendarRef.current?.getApi().refetchEvents();
  }, [selectedVenue, selectedTeams]);

  function toggleTeam(teamId: string) {
    setSelectedTeams((prev) =>
      prev.includes(teamId)
        ? prev.filter((id) => id !== teamId)
        : [...prev, teamId]
    );
  }

  function handleEventClick(info: { event: { id: string; title: string; extendedProps: Record<string, unknown> } }) {
    const props = info.event.extendedProps;
    const eventId = info.event.id;

    // Closures are not bookings — just show info
    if (props.bookingType === "closed" || eventId.startsWith("closure-")) {
      const details = [
        `Venue: ${props.venueName}`,
        props.notes ? `Reason: ${props.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      alert(`${info.event.title}\n\n${details}`);
      return;
    }

    if (isAdmin) {
      // Show admin action modal
      setSelectedEvent({
        id: eventId,
        title: info.event.title,
        venueName: props.venueName as string,
        teamName: props.teamName as string | undefined,
        opponent: props.opponent as string | undefined,
        pitchSection: props.pitchSection as string | undefined,
        notes: props.notes as string | undefined,
        status: props.status as string,
        bookingType: props.bookingType as string,
      });
    } else {
      // Non-admin: show read-only details
      const details = [
        `Venue: ${props.venueName}`,
        props.teamName ? `Team: ${props.teamName}` : null,
        props.opponent ? `Opponent: ${props.opponent}` : null,
        props.pitchSection && props.pitchSection !== "full"
          ? `Pitch: ${props.pitchSection}`
          : null,
        props.notes ? `Notes: ${props.notes}` : null,
        props.status === "pending" ? "Status: Awaiting Approval" : null,
      ]
        .filter(Boolean)
        .join("\n");
      alert(`${info.event.title}\n\n${details}`);
    }
  }

  async function handleCancelBooking() {
    if (!selectedEvent) return;
    setActionLoading(true);

    const res = await fetch(`/api/bookings/${selectedEvent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });

    if (res.ok) {
      calendarRef.current?.getApi().refetchEvents();
      setSelectedEvent(null);
      setShowCancelConfirm(false);
    } else {
      const data = await res.json();
      alert(data.error || "Failed to cancel booking");
    }
    setActionLoading(false);
  }

  async function handleApproveBooking() {
    if (!selectedEvent) return;
    setActionLoading(true);

    const res = await fetch(`/api/bookings/${selectedEvent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });

    if (res.ok) {
      calendarRef.current?.getApi().refetchEvents();
      setSelectedEvent(null);
    } else {
      const data = await res.json();
      alert(data.error || "Failed to approve booking");
    }
    setActionLoading(false);
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Venue filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Venue:</label>
          <select
            value={selectedVenue}
            onChange={(e) => setSelectedVenue(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          >
            <option value="all">All Venues</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        {/* Team filter toggle */}
        <button
          onClick={() => setShowTeamFilter(!showTeamFilter)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Filter Teams{" "}
          {selectedTeams.length > 0 && `(${selectedTeams.length})`}
        </button>

        {selectedTeams.length > 0 && (
          <button
            onClick={() => setSelectedTeams([])}
            className="text-sm text-red-600 hover:text-red-800"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Team filter dropdown */}
      {showTeamFilter && (
        <div className="mb-4 rounded-md border border-gray-200 bg-white p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {teams.map((team) => (
              <label
                key={team.id}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedTeams.includes(team.id)}
                  onChange={() => toggleTeam(team.id)}
                  className="rounded border-gray-300 text-accent-500 focus:ring-accent-500"
                />
                {team.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: "#22c55e" }} />
          Training
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: "#1E73BE" }} />
          Match
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: "#f97316" }} />
          Fixture
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: "#ef4444" }} />
          Closed
        </span>
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 sm:p-4">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
          initialView={isMobile ? "listWeek" : "timeGridWeek"}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: isMobile
              ? "listWeek,timeGridDay"
              : "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          events={fetchEvents}
          height="auto"
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          allDaySlot={true}
          nowIndicator={true}
          weekends={true}
          slotDuration="00:30:00"
          eventDisplay="block"
          eventTimeFormat={{
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }}
          eventClick={handleEventClick}
        />
      </div>

      {/* Admin booking detail modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Booking Details
            </h3>
            <div className="space-y-2 text-sm mb-4">
              <p><strong>Venue:</strong> {selectedEvent.venueName}</p>
              {selectedEvent.teamName && <p><strong>Team:</strong> {selectedEvent.teamName}</p>}
              {selectedEvent.opponent && <p><strong>Opponent:</strong> {selectedEvent.opponent}</p>}
              {selectedEvent.pitchSection && selectedEvent.pitchSection !== "full" && (
                <p><strong>Pitch:</strong> {selectedEvent.pitchSection}</p>
              )}
              {selectedEvent.notes && <p><strong>Notes:</strong> {selectedEvent.notes}</p>}
              <p>
                <strong>Status:</strong>{" "}
                <span className={
                  selectedEvent.status === "approved" ? "text-green-600" :
                  selectedEvent.status === "pending" ? "text-yellow-600" :
                  "text-gray-600"
                }>
                  {selectedEvent.status.charAt(0).toUpperCase() + selectedEvent.status.slice(1)}
                </span>
              </p>
              <p><strong>Type:</strong> {selectedEvent.bookingType.replace("_", " ")}</p>
            </div>

            {showCancelConfirm ? (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 mb-4">
                <p className="text-sm text-red-700 mb-3">
                  Are you sure you want to cancel this booking? The team will be notified.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleCancelBooking}
                    disabled={actionLoading}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {actionLoading ? "Cancelling..." : "Confirm Cancel"}
                  </button>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Go Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectedEvent.status === "pending" && (
                  <button
                    onClick={handleApproveBooking}
                    disabled={actionLoading}
                    className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                )}
                {(selectedEvent.status === "approved" || selectedEvent.status === "pending") && (
                  <>
                    <button
                      onClick={() => router.push(`/book?edit=${selectedEvent.id}`)}
                      className="rounded-md bg-primary-800 px-4 py-2 text-sm font-medium text-white hover:bg-primary-950"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Cancel Booking
                    </button>
                  </>
                )}
                <button
                  onClick={() => { setSelectedEvent(null); setShowCancelConfirm(false); }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
