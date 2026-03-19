"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";

export function Header() {
  const { data: session } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const user = session?.user as Record<string, unknown> | undefined;
  const role = user?.role as string | undefined;
  const isAdmin = role === "admin";

  const linkClass =
    "text-sm text-gray-300 hover:text-white transition-colors";
  const mobileLinkClass =
    "px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-primary-900 rounded";

  return (
    <header className="bg-primary-800 shadow-md sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between items-center">
          {/* Logo and title */}
          <Link href="/" className="flex items-center gap-3 group">
            <Image
              src="/logo.png"
              alt="Ballyhegan Davitts"
              width={40}
              height={40}
              className="rounded-full"
            />
            <div>
              <span className="text-white font-bold text-lg leading-tight block">
                Ballyhegan Davitts
              </span>
              <span className="text-gray-400 text-xs leading-tight block group-hover:text-gray-300">
                Pitch Schedule
              </span>
            </div>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/" className={linkClass}>
              Calendar
            </Link>
            {session && (
              <>
                <Link href="/dashboard" className={linkClass}>
                  Dashboard
                </Link>
                <Link href="/book" className={linkClass}>
                  Book
                </Link>
              </>
            )}
            {isAdmin && (
              <>
                <Link href="/admin" className={linkClass}>
                  Admin
                </Link>
                <Link href="/admin/requests" className={linkClass}>
                  Requests
                </Link>
              </>
            )}
            {session ? (
              <div className="flex items-center gap-3 ml-2 pl-4 border-l border-gray-600">
                <span className="text-sm text-gray-400">
                  {user?.name as string}
                </span>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="rounded-md bg-primary-950 px-3 py-1.5 text-sm text-gray-300 hover:bg-black hover:text-white transition-colors"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 transition-colors"
              >
                Sign In
              </Link>
            )}
          </nav>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-gray-300 hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              {mobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-3 border-t border-gray-600">
            <div className="flex flex-col gap-1">
              <Link
                href="/"
                className={mobileLinkClass}
                onClick={() => setMobileMenuOpen(false)}
              >
                Calendar
              </Link>
              {session && (
                <>
                  <Link
                    href="/dashboard"
                    className={mobileLinkClass}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/book"
                    className={mobileLinkClass}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Book
                  </Link>
                </>
              )}
              {isAdmin && (
                <>
                  <Link
                    href="/admin"
                    className={mobileLinkClass}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Admin
                  </Link>
                  <Link
                    href="/admin/requests"
                    className={mobileLinkClass}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Requests
                  </Link>
                </>
              )}
              {session ? (
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="px-3 py-2 text-sm text-left text-red-400 hover:text-red-300 hover:bg-primary-900 rounded"
                >
                  Sign Out ({user?.name as string})
                </button>
              ) : (
                <Link
                  href="/login"
                  className="px-3 py-2 text-sm text-accent-400 hover:text-accent-300 hover:bg-primary-900 rounded"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
