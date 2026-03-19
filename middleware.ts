import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // Admin routes require admin role
    if (pathname.startsWith("/admin") && token?.role !== "admin") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;

        // Public routes - no auth needed
        if (
          pathname === "/" ||
          pathname === "/login" ||
          pathname.startsWith("/api/calendar/events") ||
          pathname.startsWith("/api/auth")
        ) {
          return true;
        }

        // All other routes require auth
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/book/:path*",
    "/admin/:path*",
    "/api/bookings/:path*",
    "/api/venues/:path*",
    "/api/teams/:path*",
    "/api/admin/:path*",
    "/api/admins/:path*",
    "/api/notifications/:path*",
    "/api/fixtures/:path*",
  ],
};
