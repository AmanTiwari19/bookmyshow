const { getAllMovies, getMovieById } = require("./movie.service");

// GET /movies?search=action&city=Mumbai
async function listMovies(req, res, next) {
  try {
    const movies = await getAllMovies(req.query.search || "", req.query.city || "");
    res.json(movies);
  } catch (err) {
    next(err);
  }
}

// GET /movies/:id
async function getMovie(req, res, next) {
  try {
    const movie = await getMovieById(Number(req.params.id));
    res.json(movie);
  } catch (err) {
    next(err);
  }
}

module.exports = { listMovies, getMovie };
