import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const admin = await prisma.admin.findUnique({ where: { id } });
  if (!admin) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};

  if (body.password && body.password.length >= 6) {
    updateData.passwordHash = await bcrypt.hash(body.password, 12);
  }

  if (typeof body.isActive === "boolean") {
    updateData.isActive = body.isActive;
  }

  if (typeof body.receiveNotifications === "boolean") {
    updateData.receiveNotifications = body.receiveNotifications;
  }

  if (body.name && typeof body.name === "string") {
    updateData.name = body.name.trim();
  }

  if (body.email && typeof body.email === "string") {
    const newEmail = body.email.toLowerCase().trim();
    if (newEmail !== admin.email) {
      const existing = await prisma.admin.findUnique({ where: { email: newEmail } });
      if (existing) {
        return NextResponse.json(
          { error: "An admin with that email already exists" },
          { status: 409 }
        );
      }
      updateData.email = newEmail;
    }
  }

  const updated = await prisma.admin.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      receiveNotifications: true,
    },
  });

  await logAudit({
    actorType: "admin",
    actorId: session.id,
    action: "admin_updated",
    targetType: "admin",
    targetId: id,
    details: { fields: Object.keys(updateData) },
  });

  return NextResponse.json(updated);
}
