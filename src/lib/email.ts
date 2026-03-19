import nodemailer from "nodemailer";
import { prisma } from "./db";

const transporter =
  process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      })
    : null;

async function getNotificationEmails(): Promise<string[]> {
  // Get emails from admin accounts (primary source)
  const admins = await prisma.admin.findMany({
    where: { isActive: true, receiveNotifications: true },
    select: { email: true },
  });
  const adminEmails = admins.map((a) => a.email);

  // Also get any additional emails from system settings
  const setting = await prisma.systemSetting.findUnique({
    where: { key: "notification_emails" },
  });
  const settingEmails = setting
    ? (Array.isArray(setting.value) ? (setting.value as string[]) : [])
    : [];

  // Merge and deduplicate
  const allEmails = [...new Set([...adminEmails, ...settingEmails])];
  return allEmails;
}

interface EmailParams {
  to: string | string[];
  subject: string;
  html: string;
}

async function sendEmail(params: EmailParams) {
  if (!transporter) {
    console.log("[Email] SMTP not configured. Would have sent:", params.subject);
    return;
  }

  try {
    await transporter.sendMail({
      from: `"Ballyhegan Pitch Schedule" <${process.env.SMTP_USER}>`,
      to: Array.isArray(params.to) ? params.to.join(", ") : params.to,
      subject: params.subject,
      html: params.html,
    });
    console.log("[Email] Sent:", params.subject);
  } catch (error) {
    console.error("[Email] Failed to send:", error);
  }
}

export async function notifyAdminsNewRequest(booking: {
  teamName: string;
  venueName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  bookingType: string;
}) {
  const emails = await getNotificationEmails();
  if (emails.length === 0) return;

  await sendEmail({
    to: emails,
    subject: `New Booking Request: ${booking.teamName}`,
    html: `
      <h2>New Booking Request</h2>
      <p><strong>Team:</strong> ${booking.teamName}</p>
      <p><strong>Venue:</strong> ${booking.venueName}</p>
      <p><strong>Date:</strong> ${booking.bookingDate}</p>
      <p><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</p>
      <p><strong>Type:</strong> ${booking.bookingType}</p>
      <p><a href="${process.env.NEXTAUTH_URL}/admin/requests">Review in app</a></p>
    `,
  });
}

export async function notifyTeamBookingApproved(booking: {
  teamEmail?: string | null;
  teamName: string;
  venueName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
}) {
  if (!booking.teamEmail) return;

  await sendEmail({
    to: booking.teamEmail,
    subject: `Booking Approved: ${booking.venueName} on ${booking.bookingDate}`,
    html: `
      <h2>Booking Approved</h2>
      <p>Your booking has been approved.</p>
      <p><strong>Team:</strong> ${booking.teamName}</p>
      <p><strong>Venue:</strong> ${booking.venueName}</p>
      <p><strong>Date:</strong> ${booking.bookingDate}</p>
      <p><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</p>
    `,
  });
}

export async function notifyTeamBookingDeclined(booking: {
  teamEmail?: string | null;
  teamName: string;
  venueName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  reason?: string;
}) {
  if (!booking.teamEmail) return;

  await sendEmail({
    to: booking.teamEmail,
    subject: `Booking Declined: ${booking.venueName} on ${booking.bookingDate}`,
    html: `
      <h2>Booking Declined</h2>
      <p>Your booking request has been declined.</p>
      <p><strong>Team:</strong> ${booking.teamName}</p>
      <p><strong>Venue:</strong> ${booking.venueName}</p>
      <p><strong>Date:</strong> ${booking.bookingDate}</p>
      <p><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</p>
      ${booking.reason ? `<p><strong>Reason:</strong> ${booking.reason}</p>` : ""}
    `,
  });
}

export async function notifyAdminsFixtureConflict(fixture: {
  homeTeam: string;
  awayTeam: string;
  fixtureDate: string;
  startTime: string;
  competition?: string;
  conflictDetails: string;
}) {
  const emails = await getNotificationEmails();
  if (emails.length === 0) return;

  await sendEmail({
    to: emails,
    subject: `Fixture Conflict: ${fixture.homeTeam} v ${fixture.awayTeam}`,
    html: `
      <h2>Fixture Conflict Detected</h2>
      <p><strong>Fixture:</strong> ${fixture.homeTeam} v ${fixture.awayTeam}</p>
      <p><strong>Date:</strong> ${fixture.fixtureDate}</p>
      <p><strong>Time:</strong> ${fixture.startTime}</p>
      ${fixture.competition ? `<p><strong>Competition:</strong> ${fixture.competition}</p>` : ""}
      <p><strong>Conflict:</strong> ${fixture.conflictDetails}</p>
      <p><a href="${process.env.NEXTAUTH_URL}/admin/fixtures">Review in app</a></p>
    `,
  });
}

export async function notifyAdminsCancellation(booking: {
  teamName: string;
  venueName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
}) {
  const emails = await getNotificationEmails();
  if (emails.length === 0) return;

  await sendEmail({
    to: emails,
    subject: `Booking Cancelled: ${booking.teamName}`,
    html: `
      <h2>Booking Cancelled by Team</h2>
      <p><strong>Team:</strong> ${booking.teamName}</p>
      <p><strong>Venue:</strong> ${booking.venueName}</p>
      <p><strong>Date:</strong> ${booking.bookingDate}</p>
      <p><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</p>
    `,
  });
}

export async function notifyTeamBookingCancelled(booking: {
  teamEmail?: string | null;
  teamName: string;
  venueName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  cancelledBy: string;
}) {
  if (!booking.teamEmail) return;

  await sendEmail({
    to: booking.teamEmail,
    subject: `Booking Cancelled: ${booking.venueName} on ${booking.bookingDate}`,
    html: `
      <h2>Booking Cancelled</h2>
      <p>Your booking has been cancelled by an administrator (${booking.cancelledBy}).</p>
      <p><strong>Team:</strong> ${booking.teamName}</p>
      <p><strong>Venue:</strong> ${booking.venueName}</p>
      <p><strong>Date:</strong> ${booking.bookingDate}</p>
      <p><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</p>
    `,
  });
}

export async function notifyAdminsBookingUpdate(booking: {
  teamName: string;
  venueName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  action: string;
  actionBy: string;
  reason?: string;
}) {
  const emails = await getNotificationEmails();
  if (emails.length === 0) return;

  const actionLabel = booking.action.charAt(0).toUpperCase() + booking.action.slice(1);

  await sendEmail({
    to: emails,
    subject: `Booking ${actionLabel}: ${booking.teamName} — ${booking.venueName}`,
    html: `
      <h2>Booking ${actionLabel}</h2>
      <p><strong>${actionLabel} by:</strong> ${booking.actionBy}</p>
      <p><strong>Team:</strong> ${booking.teamName}</p>
      <p><strong>Venue:</strong> ${booking.venueName}</p>
      <p><strong>Date:</strong> ${booking.bookingDate}</p>
      <p><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</p>
      ${booking.reason ? `<p><strong>Reason:</strong> ${booking.reason}</p>` : ""}
    `,
  });
}

export async function notifyBookingModified(booking: {
  teamEmail?: string | null;
  teamName: string;
  venueName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  modifiedBy: string;
}) {
  // Notify the team
  if (booking.teamEmail) {
    await sendEmail({
      to: booking.teamEmail,
      subject: `Booking Modified: ${booking.venueName} on ${booking.bookingDate}`,
      html: `
        <h2>Booking Modified</h2>
        <p>Your booking has been modified by ${booking.modifiedBy}.</p>
        <p><strong>Team:</strong> ${booking.teamName}</p>
        <p><strong>Venue:</strong> ${booking.venueName}</p>
        <p><strong>Date:</strong> ${booking.bookingDate}</p>
        <p><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</p>
        <p>Please check the updated details in the app.</p>
      `,
    });
  }

  // Notify admins
  const emails = await getNotificationEmails();
  if (emails.length > 0) {
    await sendEmail({
      to: emails,
      subject: `Booking Modified: ${booking.teamName} — ${booking.venueName}`,
      html: `
        <h2>Booking Modified</h2>
        <p><strong>Modified by:</strong> ${booking.modifiedBy}</p>
        <p><strong>Team:</strong> ${booking.teamName}</p>
        <p><strong>Venue:</strong> ${booking.venueName}</p>
        <p><strong>Date:</strong> ${booking.bookingDate}</p>
        <p><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</p>
      `,
    });
  }
}
