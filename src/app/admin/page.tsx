"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function AdminPage() {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    fetch("/api/bookings?status=pending")
      .then((r) => r.json())
      .then((data) => setPendingCount(Array.isArray(data) ? data.length : 0))
      .catch(console.error);
  }, []);

  const adminLinks = [
    {
      href: "/admin/requests",
      title: "Booking Requests",
      description: `${pendingCount} pending request${pendingCount !== 1 ? "s" : ""}`,
      colour: "border-yellow-200 bg-yellow-50 hover:bg-yellow-100",
      textColour: "text-yellow-800",
      subColour: "text-yellow-600",
    },
    {
      href: "/admin/teams",
      title: "Team Management",
      description: "Add, edit, or reset team accounts",
      colour: "border-blue-200 bg-blue-50 hover:bg-blue-100",
      textColour: "text-blue-800",
      subColour: "text-blue-600",
    },
    {
      href: "/admin/venues",
      title: "Venue Closures",
      description: "Manage venue availability and closures",
      colour: "border-purple-200 bg-purple-50 hover:bg-purple-100",
      textColour: "text-purple-800",
      subColour: "text-purple-600",
    },
    {
      href: "/admin/admins",
      title: "Admin Accounts",
      description: "Add, edit, or remove admin users",
      colour: "border-indigo-200 bg-indigo-50 hover:bg-indigo-100",
      textColour: "text-indigo-800",
      subColour: "text-indigo-600",
    },
    {
      href: "/admin/fixtures",
      title: "Fixtures",
      description: "Import and review fixtures from GAA website",
      colour: "border-orange-200 bg-orange-50 hover:bg-orange-100",
      textColour: "text-orange-800",
      subColour: "text-orange-600",
    },
    {
      href: "/admin/settings",
      title: "Settings",
      description: "System settings and configuration",
      colour: "border-gray-200 bg-gray-50 hover:bg-gray-100",
      textColour: "text-gray-800",
      subColour: "text-gray-600",
    },
    {
      href: "/book",
      title: "Add Booking",
      description: "Manually add a booking to the system",
      colour: "border-green-200 bg-green-50 hover:bg-green-100",
      textColour: "text-green-800",
      subColour: "text-green-600",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Admin Dashboard
      </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {adminLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg border p-6 ${link.colour}`}
          >
            <h3 className={`font-semibold ${link.textColour}`}>
              {link.title}
            </h3>
            <p className={`text-sm mt-1 ${link.subColour}`}>
              {link.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
