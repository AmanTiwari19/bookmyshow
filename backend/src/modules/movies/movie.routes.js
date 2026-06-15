const { Router } = require("express");
const { listMovies, getMovie } = require("./movie.controller");

const router = Router();

// GET /movies          — list all, optional ?search=
// GET /movies/:id      — single movie detail
router.get("/", listMovies);
router.get("/:id", getMovie);

module.exports = router;
