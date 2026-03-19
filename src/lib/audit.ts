import { Prisma } from "@prisma/client";
import { prisma } from "./db";

interface AuditEntry {
  actorType: "team" | "admin" | "system";
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export async function logAudit(entry: AuditEntry) {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: entry.actorType,
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        details: entry.details
          ? (entry.details as unknown as Prisma.InputJsonValue)
          : undefined,
        ipAddress: entry.ipAddress,
      },
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}
