import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import type { SessionUser } from "@/types";

export async function getSession(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const user = session.user as Record<string, unknown>;
  return {
    id: user.id as string,
    role: user.role as "admin" | "team",
    name: user.name as string,
    teamSlug: user.teamSlug as string | undefined,
  };
}

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireAuth();
  if (session.role !== "admin") {
    throw new Error("Forbidden");
  }
  return session;
}

export async function requireTeam(): Promise<SessionUser> {
  const session = await requireAuth();
  if (session.role !== "team") {
    throw new Error("Forbidden");
  }
  return session;
}
