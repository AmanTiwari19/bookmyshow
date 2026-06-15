const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Return the distinct list of cities that have theaters, sorted alphabetically.
 * Drives the city dropdown in the frontend (data-driven, not hardcoded).
 */
async function findCities() {
  const rows = await prisma.theater.findMany({
    distinct: ["city"],
    select: { city: true },
    orderBy: { city: "asc" },
  });
  return rows.map((r) => r.city);
}

module.exports = { findCities };
