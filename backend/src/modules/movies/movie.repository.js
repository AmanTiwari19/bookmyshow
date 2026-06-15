const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Return all movies, optionally filtered by:
 *  - a search term (matches title or genre, case-insensitive), and/or
 *  - a city: only movies that have at least one show in a theater in that city
 *    (mirrors real BookMyShow — you only see movies playing in your city).
 */
async function findAllMovies(search = "", city = "") {
  const and = [];

  if (search) {
    and.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { genre: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (city) {
    // Movie must have some show whose screen's theater is in this city
    and.push({
      shows: { some: { screen: { theater: { city } } } },
    });
  }

  return prisma.movie.findMany({
    where: and.length ? { AND: and } : undefined,
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      description: true,
      posterUrl: true,
      genre: true,
      durationMins: true,
      rating: true,
    },
  });
}

/**
 * Return a single movie by id, or null if not found.
 */
async function findMovieById(id) {
  return prisma.movie.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      posterUrl: true,
      genre: true,
      durationMins: true,
      rating: true,
    },
  });
}

module.exports = { findAllMovies, findMovieById };
