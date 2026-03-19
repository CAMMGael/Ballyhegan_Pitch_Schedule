"use client";

import { useEffect, useState } from "react";

interface Settings {
  notification_emails: string[];
  match_default_duration: number;
  match_pre_time: number;
  current_season: string;
}

const DEFAULT_SETTINGS: Settings = {
  notification_emails: [],
  match_default_duration: 120,
  match_pre_time: 60,
  current_season: "",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings");
      if (!res.ok) throw new Error("Failed to load settings");
      const data = await res.json();

      setSettings({
        notification_emails: data.notification_emails ?? [],
        match_default_duration: data.match_default_duration ?? 120,
        match_pre_time: data.match_pre_time ?? 60,
        current_season: data.current_season ?? "",
      });
    } catch {
      setMessage({ type: "error", text: "Failed to load settings." });
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      setMessage({ type: "success", text: "Settings saved successfully." });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  }

  function addEmail() {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage({ type: "error", text: "Please enter a valid email address." });
      return;
    }
    if (settings.notification_emails.includes(email)) {
      setMessage({ type: "error", text: "This email is already in the list." });
      return;
    }
    setSettings((prev) => ({
      ...prev,
      notification_emails: [...prev.notification_emails, email],
    }));
    setNewEmail("");
    setMessage(null);
  }

  function removeEmail(email: string) {
    setSettings((prev) => ({
      ...prev,
      notification_emails: prev.notification_emails.filter((e) => e !== email),
    }));
  }

  async function handleSeasonReset() {
    setResetting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/season-reset", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Season reset failed");
      }
      const data = await res.json();
      setShowResetModal(false);
      setMessage({
        type: "success",
        text: `Season reset complete. ${data.archivedCount} booking(s) archived.`,
      });
      loadSettings();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Season reset failed." });
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">System Settings</h1>
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">System Settings</h1>

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

      <div className="space-y-6">
        {/* Notification Emails */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Notification Email Addresses
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Emails that receive system notifications (booking requests, conflicts, etc.).
          </p>

          <div className="space-y-2 mb-3">
            {settings.notification_emails.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No email addresses configured.</p>
            ) : (
              settings.notification_emails.map((email) => (
                <div
                  key={email}
                  className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2"
                >
                  <span className="text-sm text-gray-700 break-all">{email}</span>
                  <button
                    onClick={() => removeEmail(email)}
                    className="ml-2 shrink-0 text-red-500 hover:text-red-700 text-sm font-medium"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEmail()}
              placeholder="email@example.com"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
            />
            <button
              onClick={addEmail}
              className="rounded-md bg-primary-800 px-4 py-2 text-sm font-medium text-white hover:bg-primary-950"
            >
              Add
            </button>
          </div>
        </div>

        {/* Match Timing */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Match Timing Defaults
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Match Duration (minutes)
              </label>
              <input
                type="number"
                min={15}
                max={300}
                value={settings.match_default_duration}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    match_default_duration: parseInt(e.target.value) || 120,
                  }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Duration of the match itself (default: 120 minutes).
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pre-Match Time (minutes)
              </label>
              <input
                type="number"
                min={0}
                max={180}
                value={settings.match_pre_time}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    match_pre_time: parseInt(e.target.value) || 60,
                  }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Time reserved before the match for warm-up/setup (default: 60 minutes).
              </p>
            </div>
          </div>
        </div>

        {/* Current Season */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Current Season
          </h2>
          <p className="text-sm text-gray-700">
            {settings.current_season || "Not set"}
          </p>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="rounded-md bg-primary-800 px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-950 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>

        {/* Season Reset */}
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-red-800 mb-2">
            Seasonal Reset
          </h2>
          <p className="text-sm text-red-600 mb-4">
            Archive all past bookings and prepare the system for a new season.
            This action cannot be undone.
          </p>
          <button
            onClick={() => setShowResetModal(true)}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Reset Season
          </button>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Confirm Season Reset
            </h3>
            <p className="text-sm text-gray-600 mb-2">
              This will archive all bookings with dates before today. This action
              cannot be undone.
            </p>
            <p className="text-sm font-medium text-red-600 mb-4">
              Are you sure you want to proceed?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowResetModal(false)}
                disabled={resetting}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSeasonReset}
                disabled={resetting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {resetting ? "Resetting..." : "Yes, Reset Season"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
