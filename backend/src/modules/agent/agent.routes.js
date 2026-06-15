const { Router }  = require("express");
const requireAuth = require("../../middleware/requireAuth");
const { chat }    = require("./agent.controller");

const router = Router();

// POST /agent/chat — run one turn of the assistant's tool-use loop
router.post("/chat", requireAuth, chat);

module.exports = router;
