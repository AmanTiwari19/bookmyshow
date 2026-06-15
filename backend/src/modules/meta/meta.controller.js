const { findCities } = require("./meta.repository");

// GET /cities — list of cities that have theaters
async function listCities(req, res, next) {
  try {
    const cities = await findCities();
    res.json(cities);
  } catch (err) {
    next(err);
  }
}

module.exports = { listCities };
