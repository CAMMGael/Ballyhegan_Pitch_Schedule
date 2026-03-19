# Ballyhegan Davitts GAA — Pitch Scheduling App

## Project Overview

A web application for Ballyhegan Davitts GAA Club to manage pitch booking and scheduling. Coaches request venue time, admins approve/decline, and a public calendar shows all confirmed bookings. The system also imports fixtures from the club's GAA website and detects scheduling conflicts.

**Live URL:** https://ballyhegan-pitch-schedule.vercel.app (Vercel free tier)
**GitHub:** https://github.com/CAMMGael/Ballyhegan_Pitch_Schedule.git
**Local path:** /Users/cmorgan/Documents/NotWork/Ballyhegan/Ballyhegan_Pitch_Schedule

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, TypeScript) |
| Database | PostgreSQL on Neon (free tier, aws-eu-west-2) |
| ORM | Prisma 6 |
| Auth | NextAuth v4 (Credentials provider, JWT sessions) |
| Calendar | FullCalendar (React, free core — day/week/month/list views) |
| Styling | TailwindCSS 3 with custom Ballyhegan colour scheme |
| Email | Nodemailer via Gmail SMTP (ballyhegandavittsitofficer@gmail.com) |
| Hosting | Vercel (Hobby/free tier, auto-deploys from main branch) |
| Scraping | Cheerio (for GAA fixtures) |

## Credentials & Services

All credentials are in `.env.local` (gitignored). The `.env.example` file shows the required keys.

- **Database:** Neon project `sweet-base-02176757`, org `org-lucky-snow-51334800`
- **Email:** Gmail App Password for `ballyhegandavittsitofficer@gmail.com`
- **Neon CLI:** Authenticated via `npx neonctl@latest`
- **Default admin login:** `admin@ballyhegan.com` / `admin123` (seeded)
- **Default team password:** `changeme123` (seeded for all 18 teams)

## Architecture

### Two Roles
- **Sys Admin** — full access: approve/decline/edit/cancel bookings, manage teams, manage admin accounts, venue closures, fixture imports, settings, seasonal reset
- **Team** — request bookings, cancel own bookings, view calendar

### Login
Users can sign in with:
- Admin email address
- Team slug (e.g., `u14-boys`, `mens-senior`)
- Team contact email (if set)

### Booking Workflow
1. Coach submits booking request (single or recurring) → status: `pending`
2. If venue is closed on that date → auto-declined with reason
3. Admin receives email + in-app notification
4. Admin approves or declines (individually or bulk) → team notified via email + in-app
5. Admin can also edit or cancel approved bookings → both team and all admins notified
6. Coach can cancel their own approved bookings → admins notified

### Recurring Bookings
- Coach sets day-of-week, start date, end date
- System generates individual booking instances sharing a `recurringGroupId`
- Each instance is checked for conflicts at creation time
- Conflicting instances are auto-declined; clean ones are set to pending
- Admin can approve/decline each individually or bulk select all

### Pitch Splitting
Three venues support splitting: Main Pitch, Training Pitch, Loughgall 3G.
- **Main Pitch:** full, half, third, quarter (max 4 units)
- **Training Pitch & Loughgall 3G:** full, half (max 2 units)
- Only one split mode per timeslot (can't mix halves and quarters)
- A full-pitch booking blocks everything; partial bookings fill up to capacity
- Split config stored as JSONB on the `venues` table

### Venue Closures
- Admin can close any venue for a single day or date range
- Closures can be all-day or hourly (start/end time)
- Closures block new bookings (auto-decline) and show as red on calendar
- Multi-day all-day closures render as spanning red bars on the calendar

### Fixture Integration
- Scrapes from https://ballyhegan.gaa.ie/fixtures-results/ using Cheerio
- Only imports home fixtures (venue contains "Ballyhegan")
- Deduplicates via SHA-256 hash of fixture data
- Creates booking records with `booking_type='fixture_import'`, `status='approved'`
- Checks conflicts and notifies admins
- Vercel cron job runs daily at 6am (`vercel.json`)
- Admin can trigger manual scrape from `/admin/fixtures`

### Notifications
All emails sent FROM `ballyhegandavittsitofficer@gmail.com` via Gmail SMTP.

| Event | Email To | In-App To |
|-------|----------|-----------|
| New booking request | All admin emails | All admins |
| Booking approved | Team contact email + all admins | Team + all admins |
| Booking declined (with reason) | Team contact email + all admins | Team + all admins |
| Booking cancelled by coach | All admin emails | — |
| Booking cancelled by admin | Team contact email + all admins | Team + all admins |
| Booking modified by admin | Team contact email + all admins | Team + all admins |
| Fixture conflict | All admin emails | All admins |

Admin notification recipients are pulled from:
1. All active admin accounts with `receiveNotifications=true`
2. Plus any additional emails in the `notification_emails` system setting

## Database Schema (10 tables)

- **teams** — 18 team accounts (shared login per team), slug for login, optional contactEmail
- **admins** — individual admin accounts with email login, notification preferences
- **venues** — 7 venues with splitConfig (JSONB), floodlight info, surface type
- **venue_closures** — single-day or date-range closures, all-day or hourly
- **bookings** — core table: pending/approved/declined/cancelled, pitch section mode+index, recurring group ID
- **recurring_templates** — stores the original recurring request pattern
- **imported_fixtures** — scraped fixtures with dedup hash, linked to booking records
- **notifications** — in-app notification queue (team or admin recipient)
- **audit_log** — all actions with timestamps, actor, and details (JSONB)
- **system_settings** — key-value config (match durations, notification emails, season)

## File Structure

### Pages (10)
| Route | Access | Purpose |
|-------|--------|---------|
| `/` | Public | Read-only calendar (weekly default, venue/team filters) |
| `/login` | Public | Sign in (email or slug) |
| `/dashboard` | Auth | Team/admin dashboard, booking list, cancel own bookings |
| `/book` | Auth | New booking form; `?edit=ID` for admin editing |
| `/admin` | Admin | Admin dashboard with quick links |
| `/admin/requests` | Admin | Approve/decline queue with bulk actions |
| `/admin/teams` | Admin | Team CRUD, password reset, activate/deactivate |
| `/admin/admins` | Admin | Admin account management, notification toggles |
| `/admin/venues` | Admin | Venue closure management (single/range, all-day/hourly) |
| `/admin/fixtures` | Admin | Imported fixtures review, manual scrape trigger |
| `/admin/settings` | Admin | Notification emails, match defaults, seasonal reset |

### API Routes (16)
| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth handler |
| `/api/bookings` | GET, POST | List bookings, create new (single or recurring) |
| `/api/bookings/[id]` | GET, PUT, PATCH | Get/edit booking, approve/decline/cancel |
| `/api/bookings/bulk` | POST | Bulk approve/decline |
| `/api/calendar/events` | GET | FullCalendar event feed (public, supports filters) |
| `/api/venues` | GET | List all venues |
| `/api/venues/[id]` | GET | Single venue |
| `/api/venues/[id]/closures` | GET, POST, DELETE | Venue closure CRUD |
| `/api/teams` | GET, POST | List teams, create team (admin) |
| `/api/teams/[id]` | PATCH, DELETE | Update/deactivate team |
| `/api/admins` | GET, POST | List/create admin accounts |
| `/api/admins/[id]` | PATCH | Update admin (password, active, notifications) |
| `/api/admin/settings` | GET, PATCH | System settings CRUD |
| `/api/admin/season-reset` | POST | Archive old bookings |
| `/api/fixtures/scrape` | GET, POST | List fixtures, trigger scrape |
| `/api/notifications` | GET, PATCH | List/mark-read notifications |

### Core Lib Modules
| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | NextAuth config: dual-table credential lookup (admin email → team slug → team email) |
| `src/lib/auth-helpers.ts` | getSession, requireAuth, requireAdmin, requireTeam |
| `src/lib/conflicts.ts` | Conflict detection: venue closures (date ranges), pitch splitting capacity, time overlap |
| `src/lib/email.ts` | Gmail SMTP via Nodemailer: all notification email functions |
| `src/lib/notifications.ts` | In-app notification creation, notifyAllAdmins helper |
| `src/lib/audit.ts` | Audit log writer |
| `src/lib/validators.ts` | Zod schemas for all API inputs |
| `src/lib/constants.ts` | Booking types, statuses, pitch modes, colour codes |
| `src/lib/db.ts` | Prisma client singleton |
| `src/lib/utils.ts` | cn() utility for TailwindCSS class merging |

## Teams (18)

Minis (U6), U8 Boys, U8 Girls, U10 Boys, U10 Girls, U12 Boys, U12 Girls, U14 Boys, U14 Girls, U16 Boys, U16 Girls, Minor Boys, Minor Girls, U21 Boys, Reserve Men, G4MO, Mens Senior, Ladies Senior

## Venues (7)

1. **Main Pitch** — grass, best floodlights, splits: full/half/third/quarter
2. **Training Pitch** — grass, some floodlights, splits: full/half
3. **Club Hall** — indoor, no splitting
4. **Club Gym** — indoor, no splitting
5. **Running Track** — outdoor, no splitting
6. **Loughgall 3G** — artificial, splits: full/half
7. **Alternative Venue** — free-text location name for recording off-site usage

## Branding

Colours matched from https://ballyhegan.gaa.ie/:
- Header/footer: `#343a40` (dark)
- Body text: `#212529`
- Accent blue: `#1E73BE`
- Training events: `#22c55e` (green)
- Match events: `#1E73BE` (blue)
- Imported fixtures: `#f97316` (orange)
- Closures: `#ef4444` (red)
- Club logo: `public/logo.png` (300x300), `public/favicon.png` (50x50)

## Key Design Decisions

1. **Shared team logins** — one account per team, coaches share credentials. Simpler for volunteer club.
2. **Manual approval required** — prevents any team from overbooking. No auto-approve.
3. **Pitch splitting uses unit model** — only one split mode per timeslot to avoid physical layout conflicts.
4. **Email via Gmail SMTP** — zero cost, sends from club's own address. App Password auth.
5. **Admin notifications from account emails** — pulled from admin table, not just system setting. Each admin can toggle notifications.
6. **Venue closures support date ranges** — `closedDateEnd` field for extended closures (e.g., winter maintenance).
7. **Auto-decline on closed venue** — booking immediately declined with reason if venue is closed.
8. **Calendar admin actions** — admins get edit/cancel/approve modal when clicking events on calendar.

## Common Commands

```bash
# Development
npm run dev                          # Start dev server on port 3000

# Database
npx prisma db push                   # Push schema changes to Neon
npx prisma generate                  # Regenerate Prisma client
npm run db:seed                      # Seed venues, teams, admin, settings
npx prisma studio                    # Visual database browser

# Build
npx next build                       # Production build (catches type errors)

# Deploy
git push origin main                 # Auto-deploys via Vercel

# Server restart (safe — doesn't kill browsers)
pkill -f "next dev"                  # Kill dev server
npm run dev                          # Restart
# DO NOT use: kill $(lsof -ti:3000)  # This kills browser processes too
```

## Known Limitations / Future Work

- **Fixture scraper** — depends on ballyhegan.gaa.ie HTML structure; may break if GAA changes the site
- **No notification bell UI** — in-app notifications are stored but there's no bell/dropdown in the header to view them yet
- **Edit booking** — currently admin-only via calendar click; could add team self-edit for pending bookings
- **Calendar resource view** — FullCalendar premium Scheduler plugin shows venues as rows; free version uses venue filter dropdown instead
- **Neon cold starts** — ~1-2s delay after idle periods; could add ISR caching for public calendar
- **Vercel function timeout** — 10s limit on free tier; fixture scraper must complete within this window
