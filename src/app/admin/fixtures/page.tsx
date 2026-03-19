"use client";

import { useEffect, useState } from "react";

interface Fixture {
  id: string;
  fixtureDate: string;
  startTime: string;
  homeTeam: string;
  awayTeam: string;
  competition: string | null;
  lastScrapedAt: string;
  booking: {
    id: string;
    status: string;
    startTime: string;
    endTime: string;
    venue: { name: string };
  } | null;
}

interface ScrapeResult {
  imported: number;
  skippedDuplicates: number;
  conflicts: number;
}

export default function FixturesPage() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [lastScrape, setLastScrape] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadFixtures();
  }, []);

  async function loadFixtures() {
    setLoading(true);
    try {
      const res = await fetch("/api/fixtures/scrape");
      if (!res.ok) throw new Error("Failed to load fixtures");
      const data = await res.json();
      setFixtures(data.fixtures ?? []);
      setLastScrape(data.lastScrape ?? null);
    } catch {
      setMessage({ type: "error", text: "Failed to load fixtures." });
    } finally {
      setLoading(false);
    }
  }

  async function triggerScrape() {
    setScraping(true);
    setMessage(null);
    try {
      const res = await fetch("/api/fixtures/scrape", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Scrape failed");
      }
      const data: ScrapeResult = await res.json();
      setMessage({
        type: "success",
        text: `Scrape complete: ${data.imported} imported, ${data.skippedDuplicates} duplicates skipped, ${data.conflicts} conflicts found.`,
      });
      loadFixtures();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Scrape failed." });
    } finally {
      setScraping(false);
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

  function statusBadge(status: string) {
    const colours: Record<string, string> = {
      approved: "bg-green-100 text-green-700",
      pending: "bg-yellow-100 text-yellow-700",
      declined: "bg-red-100 text-red-700",
      archived: "bg-gray-100 text-gray-500",
    };
    return colours[status] ?? "bg-gray-100 text-gray-700";
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fixtures</h1>
          {lastScrape && (
            <p className="text-sm text-gray-500 mt-1">
              Last scraped:{" "}
              {new Date(lastScrape).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
        <button
          onClick={triggerScrape}
          disabled={scraping}
          className="rounded-md bg-primary-800 px-4 py-2 text-sm font-medium text-white hover:bg-primary-950 disabled:opacity-50 self-start sm:self-auto"
        >
          {scraping ? "Scraping..." : "Scrape Fixtures"}
        </button>
      </div>

      {message && (
        <div
          className={`mb-4 rounded-md p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading fixtures...</p>
      ) : fixtures.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">
            No fixtures imported yet. Click &quot;Scrape Fixtures&quot; to import from the GAA website.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {fixtures.map((fixture) => (
            <div
              key={fixture.id}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {fixture.homeTeam} vs {fixture.awayTeam}
                    </span>
                    {fixture.competition && (
                      <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-600">
                        {fixture.competition}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {formatDate(fixture.fixtureDate)} | {fixture.startTime}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {fixture.booking ? (
                    <>
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusBadge(fixture.booking.status)}`}
                      >
                        {fixture.booking.status}
                      </span>
                      <span className="text-xs text-gray-500">
                        {fixture.booking.venue.name} |{" "}
                        {fixture.booking.startTime}-{fixture.booking.endTime}
                      </span>
                    </>
                  ) : (
                    <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                      No booking
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
