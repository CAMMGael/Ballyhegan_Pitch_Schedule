import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const venues = await prisma.venue.findMany({
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(venues);
}
