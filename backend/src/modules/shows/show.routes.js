const { Router } = require("express");
const { listShows, listSeats } = require("./show.controller");

const router = Router();

// GET /shows?movieId=1&date=2024-06-15
//   → showtimes for a movie on a day, grouped by theater, upcoming only
router.get("/", listShows);

// GET /shows/:showId/seats
//   → live seat map (AVAILABLE / HELD / BOOKED), expired holds normalised
router.get("/:showId/seats", listSeats);

module.exports = router;
