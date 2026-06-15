const { findAllMovies, findMovieById } = require("./movie.repository");

async function getAllMovies(search, city) {
  return findAllMovies(search, city);
}

async function getMovieById(id) {
  const movie = await findMovieById(id);
  if (!movie) {
    const err = new Error("Movie not found");
    err.status = 404;
    throw err;
  }
  return movie;
}

module.exports = { getAllMovies, getMovieById };
