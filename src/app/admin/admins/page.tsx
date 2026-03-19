"use client";

import { useEffect, useState } from "react";

interface AdminAccount {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  receiveNotifications: boolean;
  createdAt: string;
}

export default function AdminsPage() {
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadAdmins();
  }, []);

  async function loadAdmins() {
    const res = await fetch("/api/admins");
    if (res.ok) {
      const data = await res.json();
      setAdmins(data);
    }
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading(true);
    const res = await fetch("/api/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, email: newEmail, password: newPassword }),
    });
    if (res.ok) {
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setShowAdd(false);
      await loadAdmins();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to add admin");
    }
    setActionLoading(false);
  }

  async function handleResetPassword(adminId: string) {
    if (!resetPassword || resetPassword.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }
    setActionLoading(true);
    const res = await fetch(`/api/admins/${adminId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: resetPassword }),
    });
    if (res.ok) {
      setResetId(null);
      setResetPassword("");
      alert("Password reset successfully");
    } else {
      alert("Failed to reset password");
    }
    setActionLoading(false);
  }

  async function handleToggleActive(admin: AdminAccount) {
    const res = await fetch(`/api/admins/${admin.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !admin.isActive }),
    });
    if (res.ok) await loadAdmins();
  }

  async function handleToggleNotifications(admin: AdminAccount) {
    const res = await fetch(`/api/admins/${admin.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiveNotifications: !admin.receiveNotifications }),
    });
    if (res.ok) await loadAdmins();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-950">Admin Accounts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Each admin receives email notifications for booking requests.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="rounded-md bg-primary-800 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-950"
        >
          {showAdd ? "Cancel" : "Add Admin"}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-6 bg-white rounded-lg border border-gray-200 p-4 max-w-md">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required
                placeholder="Used for login and notifications"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500" />
            </div>
            <button type="submit" disabled={actionLoading}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
              Create Admin
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-3">
          {admins.map((admin) => (
            <div key={admin.id} className={`rounded-lg border bg-white p-4 ${!admin.isActive ? "opacity-60" : ""} border-gray-200`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="font-medium text-gray-900">{admin.name}</span>
                  {!admin.isActive && <span className="ml-2 text-xs text-red-500">Inactive</span>}
                  <p className="text-sm text-gray-500">{admin.email}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={admin.receiveNotifications}
                        onChange={() => handleToggleNotifications(admin)}
                        className="rounded border-gray-300 text-accent-500 focus:ring-accent-500"
                      />
                      Receive email notifications
                    </label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setResetId(resetId === admin.id ? null : admin.id); setResetPassword(""); }}
                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                    Reset Password
                  </button>
                  <button onClick={() => handleToggleActive(admin)}
                    className={`rounded border px-2 py-1 text-xs ${admin.isActive ? "border-red-300 text-red-600 hover:bg-red-50" : "border-green-300 text-green-600 hover:bg-green-50"}`}>
                    {admin.isActive ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
              {resetId === admin.id && (
                <div className="mt-3 flex items-center gap-2">
                  <input type="text" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="New password (min 6 chars)" className="rounded-md border border-gray-300 px-3 py-1 text-sm flex-1" />
                  <button onClick={() => handleResetPassword(admin.id)} disabled={actionLoading}
                    className="rounded-md bg-primary-800 px-3 py-1 text-sm text-white hover:bg-primary-950 disabled:opacity-50">
                    Set
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
