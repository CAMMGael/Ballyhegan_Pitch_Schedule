import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";

const ALLOWED_KEYS = [
  "notification_emails",
  "match_default_duration",
  "match_pre_time",
  "current_season",
];

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.systemSetting.findMany();

  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  return NextResponse.json(settings);
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: { key: string; value: unknown }[] = [];

  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_KEYS.includes(key)) {
      return NextResponse.json(
        { error: `Unknown setting: ${key}` },
        { status: 400 }
      );
    }
    updates.push({ key, value });
  }

  if (updates.length === 0) {
    return NextResponse.json(
      { error: "No settings provided" },
      { status: 400 }
    );
  }

  // Upsert each setting
  for (const { key, value } of updates) {
    await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
  }

  return NextResponse.json({ success: true, updated: updates.map((u) => u.key) });
}
