"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { CalendarEvent } from "@/types";

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

interface PublicCalendarProps {
  includeAll?: boolean;
}

function generateTimeOptions(): string[] {
  const times: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      times.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
    }
  }
  return times;
}

const TIME_OPTIONS = generateTimeOptions();

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

  const user = session?.user as Record<string, unknown> | undefined;
  const isAdmin = user?.role === "admin";
  const isTeam = user?.role === "team";
  const isLoggedIn = !!session;

  // Event detail modal state
  const [selectedEvent, setSelectedEvent] = useState<{
    id: string;
    title: string;
    teamId?: string;
    venueId: string;
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

  // New booking modal state
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingModalMode, setBookingModalMode] = useState<"new" | "edit">("new");
  const [editBookingId, setEditBookingId] = useState<string | null>(null);
  const [bkVenueId, setBkVenueId] = useState("");
  const [bkDate, setBkDate] = useState("");
  const [bkStartTime, setBkStartTime] = useState("19:00");
  const [bkEndTime, setBkEndTime] = useState("20:00");
  const [bkType, setBkType] = useState("training");
  const [bkPitchMode, setBkPitchMode] = useState("full");
  const [bkOpponent, setBkOpponent] = useState("");
  const [bkNotes, setBkNotes] = useState("");
  const [bkTeamId, setBkTeamId] = useState("");
  const [bkAltVenue, setBkAltVenue] = useState("");
  const [bkLoading, setBkLoading] = useState(false);
  const [bkError, setBkError] = useState("");
  const [bkSuccess, setBkSuccess] = useState("");

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    fetch("/api/venues").then((r) => r.json()).then(setVenues).catch(console.error);
    fetch("/api/teams").then((r) => r.json()).then(setTeams).catch(console.error);
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
        ...(selectedTeams.length > 0 ? { teamIds: selectedTeams.join(",") } : {}),
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
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  }

  const selectedBkVenue = venues.find((v) => v.id === bkVenueId);
  const splitOptions = selectedBkVenue?.splitConfig?.allowed_splits ?? [];
  const splitLabels = selectedBkVenue?.splitConfig?.labels ?? {};

  // --- Date click: team clicks empty slot to request a booking ---
  function handleDateClick(info: { dateStr: string; date: Date }) {
    if (!isLoggedIn) return;

    const dateStr = info.date.toISOString().split("T")[0];
    const hours = info.date.getHours();
    const mins = info.date.getMinutes();
    const startTime = `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
    const endMins = hours * 60 + mins + 60;
    const endH = Math.floor(endMins / 60) % 24;
    const endM = endMins % 60;
    const endTime = `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;

    resetBookingModal();
    setBkDate(dateStr);
    setBkStartTime(startTime);
    setBkEndTime(endTime);
    setBkVenueId(selectedVenue !== "all" ? selectedVenue : "");
    setBookingModalMode("new");
    setEditBookingId(null);
    setShowBookingModal(true);
  }

  // --- Event click ---
  function handleEventClick(info: { event: { id: string; title: string; extendedProps: Record<string, unknown> } }) {
    const props = info.event.extendedProps;
    const eventId = info.event.id;

    // Closures — just show info
    if (props.bookingType === "closed" || eventId.startsWith("closure-")) {
      alert(`${info.event.title}\n\nVenue: ${props.venueName}${props.notes ? `\nReason: ${props.notes}` : ""}`);
      return;
    }

    // Build event object for modal
    const eventData = {
      id: eventId,
      title: info.event.title,
      teamId: props.teamId as string | undefined,
      venueId: props.venueId as string,
      venueName: props.venueName as string,
      teamName: props.teamName as string | undefined,
      opponent: props.opponent as string | undefined,
      pitchSection: props.pitchSection as string | undefined,
      notes: props.notes as string | undefined,
      status: props.status as string,
      bookingType: props.bookingType as string,
    };

    if (isAdmin || (isTeam && props.teamId === user?.id)) {
      setSelectedEvent(eventData);
    } else {
      // Read-only for public / other teams
      const details = [
        `Venue: ${props.venueName}`,
        props.teamName ? `Team: ${props.teamName}` : null,
        props.opponent ? `Opponent: ${props.opponent}` : null,
        props.pitchSection && props.pitchSection !== "full" ? `Pitch: ${props.pitchSection}` : null,
        props.notes ? `Notes: ${props.notes}` : null,
        props.status === "pending" ? "Status: Awaiting Approval" : null,
      ].filter(Boolean).join("\n");
      alert(`${info.event.title}\n\n${details}`);
    }
  }

  // --- Open edit modal for a booking ---
  function openEditModal(event: NonNullable<typeof selectedEvent>) {
    resetBookingModal();
    setBookingModalMode("edit");
    setEditBookingId(event.id);

    // Load booking data
    fetch(`/api/bookings/${event.id}`)
      .then((r) => r.json())
      .then((booking) => {
        setBkTeamId(booking.teamId || "");
        setBkVenueId(booking.venueId);
        setBkDate(booking.bookingDate.split("T")[0]);
        setBkStartTime(booking.startTime);
        setBkEndTime(booking.endTime);
        setBkType(booking.bookingType);
        setBkPitchMode(booking.pitchSectionMode);
        setBkOpponent(booking.opponent || "");
        setBkNotes(booking.notes || "");
        setBkAltVenue(booking.altVenueName || "");
      })
      .catch(() => setBkError("Failed to load booking"));

    setSelectedEvent(null);
    setShowBookingModal(true);
  }

  function resetBookingModal() {
    setBkTeamId(isTeam ? (user?.id as string) || "" : "");
    setBkVenueId("");
    setBkDate("");
    setBkStartTime("19:00");
    setBkEndTime("20:00");
    setBkType("training");
    setBkPitchMode("full");
    setBkOpponent("");
    setBkNotes("");
    setBkAltVenue("");
    setBkError("");
    setBkSuccess("");
    setBkLoading(false);
  }

  // --- Submit booking (new or edit) ---
  async function handleBookingSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBkError("");
    setBkSuccess("");
    setBkLoading(true);

    const payload: Record<string, unknown> = {
      teamId: bkTeamId,
      venueId: bkVenueId,
      bookingDate: bkDate,
      startTime: bkStartTime,
      endTime: bkEndTime,
      bookingType: bkType,
      pitchSectionMode: bkPitchMode,
      pitchSectionIndex: 1,
      opponent: bkType === "match" ? bkOpponent : undefined,
      notes: bkNotes || undefined,
      altVenueName: selectedBkVenue?.isFreeText ? bkAltVenue : undefined,
    };

    if (bookingModalMode === "edit" && editBookingId) {
      if (isAdmin) {
        // Admin edits directly
        const res = await fetch(`/api/bookings/${editBookingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        setBkLoading(false);
        if (!res.ok) { setBkError(data.error || "Failed to update booking"); return; }
        setBkSuccess("Booking updated. Team and admins notified.");
      } else {
        // Team requests modification — cancel old, create new pending
        await fetch(`/api/bookings/${editBookingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "cancelled" }),
        });
        const res = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        setBkLoading(false);
        if (!res.ok) { setBkError(data.error || "Failed to submit modification request"); return; }
        setBkSuccess("Modification request submitted. The original booking has been cancelled and a new request is awaiting admin approval.");
      }
    } else {
      // New booking
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setBkLoading(false);
      if (!res.ok) { setBkError(data.error || "Failed to create booking"); return; }
      if (data.booking?.status === "declined") {
        setBkSuccess(`Booking auto-declined: ${data.booking.declineReason || "Venue is closed."}`);
      } else {
        setBkSuccess("Booking request submitted. Awaiting admin approval.");
      }
    }

    calendarRef.current?.getApi().refetchEvents();
  }

  // --- Admin/Team actions on existing bookings ---
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

  const isOwnBooking = isTeam && selectedEvent?.teamId === user?.id;

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Venue:</label>
          <select
            value={selectedVenue}
            onChange={(e) => setSelectedVenue(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          >
            <option value="all">All Venues</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setShowTeamFilter(!showTeamFilter)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Filter Teams {selectedTeams.length > 0 && `(${selectedTeams.length})`}
        </button>
        {selectedTeams.length > 0 && (
          <button onClick={() => setSelectedTeams([])} className="text-sm text-red-600 hover:text-red-800">
            Clear filters
          </button>
        )}
      </div>

      {showTeamFilter && (
        <div className="mb-4 rounded-md border border-gray-200 bg-white p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {teams.map((team) => (
              <label key={team.id} className="flex items-center gap-2 text-sm cursor-pointer">
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
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: "#22c55e" }} /> Training
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: "#1E73BE" }} /> Match
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: "#f97316" }} /> Fixture
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: "#ef4444" }} /> Closed
        </span>
        {isLoggedIn && (
          <span className="text-xs text-gray-400 ml-2">Click a time slot to request a booking</span>
        )}
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 sm:p-4">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={isMobile ? "listWeek" : "timeGridWeek"}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: isMobile ? "listWeek,timeGridDay" : "dayGridMonth,timeGridWeek,timeGridDay",
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
          selectable={isLoggedIn}
          dateClick={isLoggedIn ? handleDateClick : undefined}
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          eventClick={handleEventClick}
        />
      </div>

      {/* === Event Detail Modal (admin + team own bookings) === */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setSelectedEvent(null); setShowCancelConfirm(false); }}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Booking Details</h3>
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
                  selectedEvent.status === "pending" ? "text-yellow-600" : "text-gray-600"
                }>
                  {selectedEvent.status.charAt(0).toUpperCase() + selectedEvent.status.slice(1)}
                </span>
              </p>
            </div>

            {showCancelConfirm ? (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 mb-4">
                <p className="text-sm text-red-700 mb-3">
                  {isAdmin
                    ? "Are you sure you want to cancel this booking? The team will be notified."
                    : "Are you sure you want to cancel this booking?"}
                </p>
                <div className="flex gap-2">
                  <button onClick={handleCancelBooking} disabled={actionLoading}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                    {actionLoading ? "Cancelling..." : "Confirm Cancel"}
                  </button>
                  <button onClick={() => setShowCancelConfirm(false)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                    Go Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {/* Admin actions */}
                {isAdmin && selectedEvent.status === "pending" && (
                  <button onClick={handleApproveBooking} disabled={actionLoading}
                    className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                    Approve
                  </button>
                )}
                {isAdmin && (selectedEvent.status === "approved" || selectedEvent.status === "pending") && (
                  <>
                    <button onClick={() => openEditModal(selectedEvent)}
                      className="rounded-md bg-primary-800 px-4 py-2 text-sm font-medium text-white hover:bg-primary-950">
                      Edit
                    </button>
                    <button onClick={() => setShowCancelConfirm(true)}
                      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                      Cancel Booking
                    </button>
                  </>
                )}

                {/* Team actions on own bookings */}
                {isOwnBooking && !isAdmin && (selectedEvent.status === "approved" || selectedEvent.status === "pending") && (
                  <>
                    <button onClick={() => openEditModal(selectedEvent)}
                      className="rounded-md bg-primary-800 px-4 py-2 text-sm font-medium text-white hover:bg-primary-950">
                      Request Modification
                    </button>
                    <button onClick={() => setShowCancelConfirm(true)}
                      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                      Cancel Booking
                    </button>
                  </>
                )}

                <button onClick={() => { setSelectedEvent(null); setShowCancelConfirm(false); }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* === Booking Request / Edit Modal === */}
      {showBookingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-8" onClick={() => { setShowBookingModal(false); resetBookingModal(); }}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg mx-4 my-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {bookingModalMode === "edit"
                ? (isAdmin ? "Edit Booking" : "Request Modification")
                : "Request Booking"}
            </h3>
            {bookingModalMode === "edit" && !isAdmin && (
              <p className="text-xs text-gray-500 mb-3">
                This will cancel the current booking and submit a new request for admin approval.
              </p>
            )}

            <form onSubmit={handleBookingSubmit} className="space-y-3 mt-3">
              {/* Team (admin only) */}
              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Team *</label>
                  <select value={bkTeamId} onChange={(e) => setBkTeamId(e.target.value)} required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500">
                    <option value="">Select team...</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}

              {/* Venue */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue *</label>
                <select value={bkVenueId} onChange={(e) => { setBkVenueId(e.target.value); setBkPitchMode("full"); }} required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500">
                  <option value="">Select venue...</option>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>

              {/* Alt venue name */}
              {selectedBkVenue?.isFreeText && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Venue Name *</label>
                  <input type="text" value={bkAltVenue} onChange={(e) => setBkAltVenue(e.target.value)} required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500" />
                </div>
              )}

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" value="training" checked={bkType === "training"} onChange={(e) => setBkType(e.target.value)}
                      className="text-accent-500 focus:ring-accent-500" /> Training
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" value="match" checked={bkType === "match"} onChange={(e) => setBkType(e.target.value)}
                      className="text-accent-500 focus:ring-accent-500" /> Match
                  </label>
                </div>
              </div>

              {/* Pitch section */}
              {splitOptions.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pitch Section *</label>
                  <select value={bkPitchMode} onChange={(e) => setBkPitchMode(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500">
                    {splitOptions.map((s) => <option key={s} value={s}>{splitLabels[s] ?? s}</option>)}
                  </select>
                </div>
              )}

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                <input type="date" value={bkDate} onChange={(e) => setBkDate(e.target.value)} required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500" />
              </div>

              {/* Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start *</label>
                  <select value={bkStartTime} onChange={(e) => setBkStartTime(e.target.value)} required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500">
                    {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End *</label>
                  <select value={bkEndTime} onChange={(e) => setBkEndTime(e.target.value)} required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500">
                    {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Quick durations */}
              <div className="flex gap-2">
                {[60, 90, 180].map((mins) => (
                  <button key={mins} type="button" onClick={() => {
                    const [h, m] = bkStartTime.split(":").map(Number);
                    const end = h * 60 + m + mins;
                    setBkEndTime(`${Math.floor(end / 60) % 24}`.padStart(2, "0") + ":" + `${end % 60}`.padStart(2, "0"));
                  }} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                    {mins === 60 ? "1hr" : mins === 90 ? "90min" : "3hr"}
                  </button>
                ))}
              </div>

              {/* Opponent */}
              {bkType === "match" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Opponent *</label>
                  <input type="text" value={bkOpponent} onChange={(e) => setBkOpponent(e.target.value)} required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500" />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={bkNotes} onChange={(e) => setBkNotes(e.target.value)} rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500" />
              </div>

              {/* Messages */}
              {bkError && <div className="rounded-md bg-red-50 p-3"><p className="text-sm text-red-700">{bkError}</p></div>}
              {bkSuccess && <div className="rounded-md bg-green-50 p-3"><p className="text-sm text-green-700">{bkSuccess}</p></div>}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                {!bkSuccess && (
                  <button type="submit" disabled={bkLoading}
                    className="rounded-md bg-primary-800 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-950 disabled:opacity-50">
                    {bkLoading ? "Submitting..." :
                      bookingModalMode === "edit"
                        ? (isAdmin ? "Update Booking" : "Submit Modification Request")
                        : "Submit Request"}
                  </button>
                )}
                <button type="button" onClick={() => { setShowBookingModal(false); resetBookingModal(); }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  {bkSuccess ? "Close" : "Cancel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
