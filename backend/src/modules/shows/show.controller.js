const { getShowsForMovieOnDate, getSeatMap } = require("./show.service");

/**
 * GET /shows?movieId=1&date=2024-06-15
 *
 * Returns showtimes for a movie on a given day, grouped by theater.
 * Only upcoming shows (startTime > now) are included.
 */
async function listShows(req, res, next) {
  try {
    const movieId = Number(req.query.movieId);
    const date    = req.query.date; // "YYYY-MM-DD"
    const city    = req.query.city || ""; // optional

    if (!movieId || isNaN(movieId)) {
      return res.status(400).json({ error: "movieId query param is required", code: "BAD_REQUEST" });
    }
    if (!date) {
      return res.status(400).json({ error: "date query param is required (YYYY-MM-DD)", code: "BAD_REQUEST" });
    }

    const result = await getShowsForMovieOnDate(movieId, date, city);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /shows/:showId/seats
 *
 * Returns the live seat map for a show.
 * Expired holds are normalised to AVAILABLE server-side.
 */
async function listSeats(req, res, next) {
  try {
    const showId = Number(req.params.showId);
    if (isNaN(showId)) {
      return res.status(400).json({ error: "Invalid showId", code: "BAD_REQUEST" });
    }

    const seats = await getSeatMap(showId);
    res.json(seats);
  } catch (err) {
    next(err);
  }
}

module.exports = { listShows, listSeats };
