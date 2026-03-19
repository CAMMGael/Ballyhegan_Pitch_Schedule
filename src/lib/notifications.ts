import { prisma } from "./db";

interface CreateNotificationParams {
  recipientType: "team" | "admin";
  recipientTeamId?: string;
  recipientAdminId?: string;
  title: string;
  body: string;
  relatedBookingId?: string;
}

export async function createNotification(params: CreateNotificationParams) {
  try {
    await prisma.notification.create({
      data: {
        recipientType: params.recipientType,
        recipientTeamId: params.recipientTeamId,
        recipientAdminId: params.recipientAdminId,
        title: params.title,
        body: params.body,
        relatedBookingId: params.relatedBookingId,
      },
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
}

export async function notifyAllAdmins(title: string, body: string, relatedBookingId?: string) {
  const admins = await prisma.admin.findMany({
    where: { isActive: true, receiveNotifications: true },
    select: { id: true },
  });

  for (const admin of admins) {
    await createNotification({
      recipientType: "admin",
      recipientAdminId: admin.id,
      title,
      body,
      relatedBookingId,
    });
  }
}
