import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, requireAdmin } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const includeAll = searchParams.get("all") === "true";

  // Only admins can see inactive teams
  if (includeAll) {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const teams = await prisma.team.findMany({
    where: includeAll ? {} : { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      contactEmail: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(teams);
}

export async function POST(req: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, password, contactEmail } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Team name is required" },
      { status: 400 }
    );
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  const trimmedName = name.trim();
  const slug = slugify(trimmedName);

  if (!slug) {
    return NextResponse.json(
      { error: "Team name produces an invalid slug" },
      { status: 400 }
    );
  }

  // Check for duplicate name or slug
  const existing = await prisma.team.findFirst({
    where: {
      OR: [{ name: trimmedName }, { slug }],
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: "A team with that name already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const team = await prisma.team.create({
    data: {
      name: trimmedName,
      slug,
      passwordHash,
      contactEmail: contactEmail || null,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      contactEmail: true,
      isActive: true,
      createdAt: true,
    },
  });

  await logAudit({
    actorType: "admin",
    actorId: admin.id,
    action: "team_created",
    targetType: "team",
    targetId: team.id,
    details: { name: trimmedName, slug },
  });

  return NextResponse.json(team, { status: 201 });
}
