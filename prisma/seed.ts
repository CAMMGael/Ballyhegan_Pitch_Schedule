import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Seed venues
  const venues: Prisma.VenueCreateInput[] = [
    {
      name: "Main Pitch",
      slug: "main-pitch",
      hasFloodlights: true,
      surfaceType: "grass",
      splitConfig: {
        max_units: 4,
        allowed_splits: ["full", "half", "third", "quarter"],
        labels: { full: "Full Pitch", half: "Half Pitch", third: "Third of Pitch", quarter: "Quarter Pitch" },
      },
      sortOrder: 1,
    },
    {
      name: "Training Pitch",
      slug: "training-pitch",
      hasFloodlights: true,
      surfaceType: "grass",
      splitConfig: {
        max_units: 2,
        allowed_splits: ["full", "half"],
        labels: { full: "Full Pitch", half: "Half Pitch" },
      },
      sortOrder: 2,
    },
    {
      name: "Club Hall",
      slug: "club-hall",
      hasFloodlights: false,
      surfaceType: "indoor",
      splitConfig: Prisma.JsonNull,
      sortOrder: 3,
    },
    {
      name: "Club Gym",
      slug: "club-gym",
      hasFloodlights: false,
      surfaceType: "indoor",
      splitConfig: Prisma.JsonNull,
      sortOrder: 4,
    },
    {
      name: "Running Track",
      slug: "running-track",
      hasFloodlights: false,
      surfaceType: "outdoor",
      splitConfig: Prisma.JsonNull,
      sortOrder: 5,
    },
    {
      name: "Loughgall 3G",
      slug: "loughgall-3g",
      hasFloodlights: false,
      surfaceType: "3g",
      splitConfig: {
        max_units: 2,
        allowed_splits: ["full", "half"],
        labels: { full: "Full Pitch", half: "Half Pitch" },
      },
      sortOrder: 6,
    },
    {
      name: "Alternative Venue",
      slug: "alternative-venue",
      hasFloodlights: false,
      splitConfig: Prisma.JsonNull,
      isFreeText: true,
      sortOrder: 7,
    },
  ];

  for (const venue of venues) {
    await prisma.venue.upsert({
      where: { slug: venue.slug },
      update: {
        name: venue.name,
        hasFloodlights: venue.hasFloodlights,
        surfaceType: venue.surfaceType,
        splitConfig: venue.splitConfig,
        sortOrder: venue.sortOrder,
        isFreeText: venue.isFreeText,
      },
      create: venue,
    });
  }
  console.log(`Seeded ${venues.length} venues`);

  // Seed teams
  const teamNames = [
    "Minis (U6)",
    "U8 Boys",
    "U8 Girls",
    "U10 Boys",
    "U10 Girls",
    "U12 Boys",
    "U12 Girls",
    "U14 Boys",
    "U14 Girls",
    "U16 Boys",
    "U16 Girls",
    "Minor Boys",
    "Minor Girls",
    "U21 Boys",
    "Reserve Men",
    "G4MO",
    "Mens Senior",
    "Ladies Senior",
  ];

  const defaultPassword = await bcrypt.hash("changeme123", 12);

  for (const name of teamNames) {
    const slug = name
      .toLowerCase()
      .replace(/[()]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();

    await prisma.team.upsert({
      where: { slug },
      update: { name },
      create: {
        name,
        slug,
        passwordHash: defaultPassword,
      },
    });
  }
  console.log(`Seeded ${teamNames.length} teams`);

  // Seed initial admin account
  const adminPassword = await bcrypt.hash("admin123", 12);
  await prisma.admin.upsert({
    where: { email: "admin@ballyhegan.com" },
    update: {},
    create: {
      email: "admin@ballyhegan.com",
      name: "System Admin",
      passwordHash: adminPassword,
    },
  });
  console.log("Seeded initial admin account (admin@ballyhegan.com / admin123)");

  // Seed default system settings
  const settings = [
    { key: "match_pre_time_minutes", value: 60 },
    { key: "match_duration_minutes", value: 120 },
    { key: "notification_emails", value: ["admin@ballyhegan.com"] },
    { key: "current_season", value: "2026" },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: { key: setting.key, value: setting.value },
    });
  }
  console.log("Seeded system settings");

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
