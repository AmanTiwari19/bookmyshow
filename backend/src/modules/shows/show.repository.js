const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Seats bookable right now: AVAILABLE, or HELD but past heldUntil (lazy reclaim).
 * Must stay in sync with show.service.js getSeatMap() normalization.
 */
function countableAsAvailableWhere(now = new Date()) {
  return {
    OR: [
      { status: "AVAILABLE" },
      { status: "HELD", heldUntil: { lt: now } },
    ],
  };
}

/**
 * Find shows for a movie on a given calendar date.
 *
 * Design doc section 3.2a:
 *  - date is NOT a separate column; it lives inside Show.startTime (UTC timestamp).
 *  - Filter: startTime >= day 00:00 UTC AND startTime < next day 00:00 UTC.
 *  - Upcoming only: startTime must be in the future (> now).
 *  - Results grouped by theater in the service layer.
 *
 * @param {number} movieId
 * @param {string} dateStr   - "YYYY-MM-DD" in UTC
 * @param {string} [city]    - optional: only theaters in this city
 */
async function findShowsByMovieAndDate(movieId, dateStr, city = "") {
  // Build the UTC day window
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dayEnd   = new Date(`${dateStr}T00:00:00.000Z`);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const now = new Date();

  return prisma.show.findMany({
    where: {
      movieId,
      startTime: {
        gte: dayStart,
        lt:  dayEnd,
      },
      // Upcoming only — skip shows that already started
      AND: { startTime: { gt: now } },
      // Optional city filter — Show → Screen → Theater → city
      ...(city ? { screen: { theater: { city } } } : {}),
    },
    orderBy: { startTime: "asc" },
    include: {
      screen: {
        include: {
          theater: true,
        },
      },
      movie: {
        select: { id: true, title: true, durationMins: true },
      },
      // Count bookable seats (includes expired holds — same rule as seat map)
      _count: {
        select: {
          showSeats: {
            where: countableAsAvailableWhere(now),
          },
        },
      },
    },
  });
}

/**
 * Fetch the full seat map for a show — every ShowSeat with its Seat details.
 * Used by the seat-picker UI and the AI agent.
 *
 * @param {number} showId
 */
async function findSeatsByShow(showId) {
  return prisma.showSeat.findMany({
    where: { showId },
    orderBy: [
      { seat: { row: "asc" } },
      { seat: { number: "asc" } },
    ],
    select: {
      id:        true,
      status:    true,
      heldUntil: true,
      heldBy:    true,
      seat: {
        select: {
          id:     true,
          row:    true,
          number: true,
        },
      },
    },
  });
}

/**
 * Fetch a show with its screen+theater info (used for confirmation pages etc.)
 */
async function findShowById(showId) {
  return prisma.show.findUnique({
    where: { id: showId },
    include: {
      movie:  true,
      screen: { include: { theater: true } },
    },
  });
}

module.exports = { findShowsByMovieAndDate, findSeatsByShow, findShowById };
