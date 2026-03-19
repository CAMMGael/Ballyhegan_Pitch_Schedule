import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";

export async function POST() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Archive all bookings with dates before today
  const result = await prisma.booking.updateMany({
    where: {
      bookingDate: { lt: today },
      status: { notIn: ["archived", "cancelled"] },
    },
    data: {
      status: "archived",
    },
  });

  // Update the current season setting
  const year = today.getFullYear();
  const seasonLabel = `${year}`;
  await prisma.systemSetting.upsert({
    where: { key: "current_season" },
    create: { key: "current_season", value: seasonLabel as never },
    update: { value: seasonLabel as never },
  });

  await logAudit({
    actorType: "admin",
    actorId: admin.id,
    action: "season_reset",
    details: {
      archivedCount: result.count,
      newSeason: seasonLabel,
      resetDate: today.toISOString(),
    },
  });

  return NextResponse.json({
    success: true,
    archivedCount: result.count,
    newSeason: seasonLabel,
  });
}
