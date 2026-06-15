const {
  findShowsByMovieAndDate,
  findSeatsByShow,
  findShowById,
} = require("./show.repository");

/**
 * Return shows for a movie on a date, grouped by theater.
 *
 * Response shape:
 * [
 *   {
 *     theater: { id, name, city },
 *     shows: [
 *       { id, startTime, price, availableSeats, screen: { id, name } }
 *     ]
 *   }
 * ]
 */
async function getShowsForMovieOnDate(movieId, dateStr, city) {
  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const err = new Error("date must be YYYY-MM-DD");
    err.status = 400;
    throw err;
  }

  const shows = await findShowsByMovieAndDate(movieId, dateStr, city);

  // Group by theater
  const theaterMap = new Map();

  for (const show of shows) {
    const theater = show.screen.theater;
    const key     = theater.id;

    if (!theaterMap.has(key)) {
      theaterMap.set(key, {
        theater: { id: theater.id, name: theater.name, city: theater.city },
        shows: [],
      });
    }

    theaterMap.get(key).shows.push({
      id:             show.id,
      startTime:      show.startTime,
      price:          show.price,
      // Repository counts AVAILABLE + expired HELD (lazy reclaim) — matches getSeatMap()
      availableSeats: show._count.showSeats,
      screen: {
        id:   show.screen.id,
        name: show.screen.name,
      },
    });
  }

  return Array.from(theaterMap.values());
}

/**
 * Return the seat map for a show.
 * Expired holds are surfaced as AVAILABLE so the UI is always fresh.
 *
 * Each entry: { id, status, seat: { id, row, number } }
 * status is normalised: if HELD and heldUntil < now → treat as AVAILABLE
 */
async function getSeatMap(showId) {
  // Verify show exists
  const show = await findShowById(showId);
  if (!show) {
    const err = new Error("Show not found");
    err.status = 404;
    throw err;
  }

  const now      = new Date();
  const showSeats = await findSeatsByShow(showId);

  return showSeats.map((ss) => {
    const effectiveStatus =
      ss.status === "HELD" && ss.heldUntil && ss.heldUntil < now
        ? "AVAILABLE"
        : ss.status;

    return {
      id:     ss.id,           // ShowSeat id — used in hold requests
      status: effectiveStatus,
      seat:   ss.seat,         // { id, row, number }
    };
  });
}

module.exports = { getShowsForMovieOnDate, getSeatMap };
