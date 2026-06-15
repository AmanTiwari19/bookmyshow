const { Router } = require("express");
const { listCities } = require("./meta.controller");

const router = Router();

// GET /cities — distinct theater cities
router.get("/", listCities);

module.exports = router;
