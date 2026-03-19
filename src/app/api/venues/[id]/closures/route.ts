import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { venueClosureSchema } from "@/lib/validators";
import { logAudit } from "@/lib/audit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const venue = await prisma.venue.findUnique({ where: { id } });
  if (!venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // For date range closures, we need to find closures where the range overlaps
  // A closure covers closedDate to closedDateEnd (or just closedDate if no end)
  let whereClause;
  if (from || to) {
    const conditions = [];
    if (from) {
      // Closure end date (or start date if single-day) must be >= from
      conditions.push({
        OR: [
          { closedDateEnd: { gte: new Date(from) } },
          { closedDateEnd: null, closedDate: { gte: new Date(from) } },
        ],
      });
    }
    if (to) {
      // Closure start date must be <= to
      conditions.push({ closedDate: { lte: new Date(to) } });
    }
    whereClause = { venueId: id, AND: conditions };
  } else {
    whereClause = { venueId: id };
  }

  const closures = await prisma.venueClosure.findMany({
    where: whereClause,
    orderBy: { closedDate: "asc" },
  });

  return NextResponse.json(closures);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const venue = await prisma.venue.findUnique({ where: { id } });
  if (!venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = venueClosureSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { closedDate, closedDateEnd, startTime, endTime, reason } = parsed.data;

  // If one of startTime/endTime is set, both must be set
  if ((startTime && !endTime) || (!startTime && endTime)) {
    return NextResponse.json(
      { error: "Both startTime and endTime must be provided for hourly closures" },
      { status: 400 }
    );
  }

  if (startTime && endTime && startTime >= endTime) {
    return NextResponse.json(
      { error: "startTime must be before endTime" },
      { status: 400 }
    );
  }

  // Validate date range
  if (closedDateEnd && closedDateEnd < closedDate) {
    return NextResponse.json(
      { error: "End date must be on or after start date" },
      { status: 400 }
    );
  }

  const closure = await prisma.venueClosure.create({
    data: {
      venueId: id,
      closedDate: new Date(closedDate),
      closedDateEnd: closedDateEnd ? new Date(closedDateEnd) : null,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
      reason: reason ?? null,
      createdBy: admin.id,
    },
  });

  await logAudit({
    actorType: "admin",
    actorId: admin.id,
    action: "venue_closure_created",
    targetType: "venue_closure",
    targetId: closure.id,
    details: {
      venueId: id,
      venueName: venue.name,
      closedDate,
      closedDateEnd: closedDateEnd ?? null,
      startTime,
      endTime,
      reason,
    },
  });

  return NextResponse.json(closure, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: venueId } = await params;
  const { searchParams } = new URL(req.url);
  const closureId = searchParams.get("closureId");

  if (!closureId) {
    return NextResponse.json(
      { error: "closureId query parameter is required" },
      { status: 400 }
    );
  }

  const closure = await prisma.venueClosure.findFirst({
    where: { id: closureId, venueId },
  });

  if (!closure) {
    return NextResponse.json({ error: "Closure not found" }, { status: 404 });
  }

  await prisma.venueClosure.delete({ where: { id: closureId } });

  await logAudit({
    actorType: "admin",
    actorId: admin.id,
    action: "venue_closure_deleted",
    targetType: "venue_closure",
    targetId: closureId,
    details: {
      venueId,
      closedDate: closure.closedDate,
      closedDateEnd: closure.closedDateEnd,
      startTime: closure.startTime,
      endTime: closure.endTime,
      reason: closure.reason,
    },
  });

  return NextResponse.json({ success: true });
}
