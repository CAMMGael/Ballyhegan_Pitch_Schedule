"use client";

import { useEffect, useState, useCallback } from "react";

interface Team {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  isActive: boolean;
  createdAt: string;
}

type ModalState =
  | { type: "none" }
  | { type: "add" }
  | { type: "resetPassword"; team: Team }
  | { type: "editEmail"; team: Team };

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Add team form
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");

  // Reset password form
  const [resetPassword, setResetPassword] = useState("");

  // Edit email form
  const [editEmail, setEditEmail] = useState("");

  const loadTeams = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/teams?all=true`);
      if (!res.ok) throw new Error("Failed to load teams");
      const data = await res.json();
      setTeams(Array.isArray(data) ? data : []);
    } catch {
      setError("Failed to load teams");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  function closeModal() {
    setModal({ type: "none" });
    setNewName("");
    setNewPassword("");
    setNewEmail("");
    setResetPassword("");
    setEditEmail("");
  }

  async function handleAddTeam(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          password: newPassword,
          contactEmail: newEmail.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create team");
      }

      const created = await res.json();
      setTeams((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
      );
      setSuccess(`Team "${created.name}" created successfully`);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (modal.type !== "resetPassword") return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/teams/${modal.team.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reset password");
      }

      setSuccess(`Password reset for "${modal.team.name}"`);
      closeModal();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reset password"
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditEmail(e: React.FormEvent) {
    e.preventDefault();
    if (modal.type !== "editEmail") return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/teams/${modal.team.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactEmail: editEmail.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update email");
      }

      const updated = await res.json();
      setTeams((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t))
      );
      setSuccess(`Contact email updated for "${modal.team.name}"`);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update email");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(team: Team) {
    const action = team.isActive ? "deactivate" : "reactivate";
    if (!confirm(`Are you sure you want to ${action} "${team.name}"?`)) return;

    setError(null);
    try {
      const res = await fetch(`/api/teams/${team.id}`, {
        method: team.isActive ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        ...(team.isActive ? {} : { body: JSON.stringify({ isActive: true }) }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${action} team`);
      }

      const updated = await res.json();
      setTeams((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t))
      );
      setSuccess(
        `"${team.name}" ${team.isActive ? "deactivated" : "reactivated"}`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Failed to ${action} team`
      );
    }
  }

  const visibleTeams = showInactive
    ? teams
    : teams.filter((t) => t.isActive);

  const inactiveCount = teams.filter((t) => !t.isActive).length;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Team Management</h1>
        <button
          onClick={() => setModal({ type: "add" })}
          className="rounded-md bg-primary-800 px-4 py-2 text-sm font-medium text-white hover:bg-primary-950 transition-colors"
        >
          Add Team
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Filter */}
      {inactiveCount > 0 && (
        <div className="mb-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-gray-300 text-accent-500 focus:ring-accent-500"
            />
            Show inactive teams ({inactiveCount})
          </label>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading teams...</p>
      ) : visibleTeams.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No teams found.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Slug
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Contact Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleTeams.map((team) => (
                  <tr
                    key={team.id}
                    className={!team.isActive ? "bg-gray-50 opacity-60" : ""}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                      {team.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 font-mono">
                      {team.slug}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {team.contactEmail || (
                        <span className="text-gray-300">--</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {team.isActive ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditEmail(team.contactEmail || "");
                            setModal({ type: "editEmail", team });
                          }}
                          className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Edit Email
                        </button>
                        <button
                          onClick={() =>
                            setModal({ type: "resetPassword", team })
                          }
                          className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Reset Password
                        </button>
                        <button
                          onClick={() => handleToggleActive(team)}
                          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                            team.isActive
                              ? "border border-red-300 text-red-700 hover:bg-red-50"
                              : "border border-green-300 text-green-700 hover:bg-green-50"
                          }`}
                        >
                          {team.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {visibleTeams.map((team) => (
              <div
                key={team.id}
                className={`rounded-lg border bg-white p-4 ${
                  !team.isActive
                    ? "border-gray-200 opacity-60"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-medium text-gray-900">{team.name}</h3>
                    <p className="text-xs text-gray-400 font-mono">
                      {team.slug}
                    </p>
                  </div>
                  {team.isActive ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 shrink-0">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 shrink-0">
                      Inactive
                    </span>
                  )}
                </div>
                {team.contactEmail && (
                  <p className="text-sm text-gray-500 mb-3">
                    {team.contactEmail}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setEditEmail(team.contactEmail || "");
                      setModal({ type: "editEmail", team });
                    }}
                    className="rounded border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Edit Email
                  </button>
                  <button
                    onClick={() =>
                      setModal({ type: "resetPassword", team })
                    }
                    className="rounded border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Reset Password
                  </button>
                  <button
                    onClick={() => handleToggleActive(team)}
                    className={`rounded px-2.5 py-1.5 text-xs font-medium ${
                      team.isActive
                        ? "border border-red-300 text-red-700 hover:bg-red-50"
                        : "border border-green-300 text-green-700 hover:bg-green-50"
                    }`}
                  >
                    {team.isActive ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add Team Modal */}
      {modal.type === "add" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Add New Team
            </h3>
            <form onSubmit={handleAddTeam} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Team Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  placeholder="e.g. U14 Hurling"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                />
                {newName.trim() && (
                  <p className="mt-1 text-xs text-gray-400">
                    Slug:{" "}
                    {newName
                      .toLowerCase()
                      .trim()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-+|-+$/g, "")}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Min 6 characters"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Email{" "}
                  <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="team@example.com"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-primary-800 px-4 py-2 text-sm font-medium text-white hover:bg-primary-950 disabled:opacity-50"
                >
                  {submitting ? "Creating..." : "Create Team"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {modal.type === "resetPassword" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Reset Password
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Set a new password for{" "}
              <span className="font-medium text-gray-700">
                {modal.team.name}
              </span>
            </p>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <input
                  type="text"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Min 6 characters"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-primary-800 px-4 py-2 text-sm font-medium text-white hover:bg-primary-950 disabled:opacity-50"
                >
                  {submitting ? "Resetting..." : "Reset Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Email Modal */}
      {modal.type === "editEmail" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Edit Contact Email
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Update the contact email for{" "}
              <span className="font-medium text-gray-700">
                {modal.team.name}
              </span>
            </p>
            <form onSubmit={handleEditEmail} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="team@example.com (leave blank to clear)"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-primary-800 px-4 py-2 text-sm font-medium text-white hover:bg-primary-950 disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
