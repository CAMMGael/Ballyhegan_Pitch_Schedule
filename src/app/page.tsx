import { PublicCalendar } from "@/components/calendar/PublicCalendar";

export default function HomePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary-950">
          Ballyhegan Davitts GAA — Pitch Schedule
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          View all approved bookings and fixtures across club venues.
        </p>
      </div>
      <PublicCalendar />
    </div>
  );
}
