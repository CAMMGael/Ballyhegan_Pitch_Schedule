import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";

export async function PATCH(
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
  const body = await req.json();

  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  const auditDetails: Record<string, unknown> = {};

  // Reset password
  if (body.password && typeof body.password === "string") {
    if (body.password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }
    updateData.passwordHash = await bcrypt.hash(body.password, 12);
    auditDetails.passwordReset = true;
  }

  // Toggle active status
  if (typeof body.isActive === "boolean") {
    updateData.isActive = body.isActive;
    auditDetails.isActive = body.isActive;
  }

  // Update contact email
  if (body.contactEmail !== undefined) {
    updateData.contactEmail = body.contactEmail || null;
    auditDetails.contactEmail = body.contactEmail || null;
  }

  // Update name
  if (body.name && typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (trimmed.length === 0) {
      return NextResponse.json(
        { error: "Name cannot be empty" },
        { status: 400 }
      );
    }
    const existing = await prisma.team.findFirst({
      where: { name: trimmed, id: { not: id } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A team with that name already exists" },
        { status: 409 }
      );
    }
    updateData.name = trimmed;
    auditDetails.name = trimmed;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const updated = await prisma.team.update({
    where: { id },
    data: updateData,
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
    action: "team_updated",
    targetType: "team",
    targetId: id,
    details: auditDetails,
  });

  return NextResponse.json(updated);
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

  const { id } = await params;

  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const updated = await prisma.team.update({
    where: { id },
    data: { isActive: false },
    select: {
      id: true,
      name: true,
      slug: true,
      contactEmail: true,
      isActive: true,
    },
  });

  await logAudit({
    actorType: "admin",
    actorId: admin.id,
    action: "team_deactivated",
    targetType: "team",
    targetId: id,
    details: { teamName: team.name },
  });

  return NextResponse.json(updated);
}
