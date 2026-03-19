import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth-helpers";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const where =
    session.role === "admin"
      ? { recipientType: "admin", recipientAdminId: session.id }
      : { recipientType: "team", recipientTeamId: session.id };

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(notifications);
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ids } = await req.json();

  if (!Array.isArray(ids)) {
    return NextResponse.json({ error: "ids must be an array" }, { status: 400 });
  }

  await prisma.notification.updateMany({
    where: {
      id: { in: ids },
      ...(session.role === "admin"
        ? { recipientAdminId: session.id }
        : { recipientTeamId: session.id }),
    },
    data: { isRead: true },
  });

  return NextResponse.json({ success: true });
}
