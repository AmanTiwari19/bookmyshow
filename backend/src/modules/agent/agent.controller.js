const agentService = require("./agent.service");

/**
 * POST /agent/chat
 * Body: { message: string, history?: Content[], city?: string }
 * Auth: required (so hold_seats can attach the real user).
 *
 * Returns: { reply, uiState, history }
 *  - reply   : assistant's text for this turn
 *  - uiState : { currentShowId, booking } hint for the right pane (or null)
 *  - history : updated conversation to send back next turn (stateless)
 */
async function chat(req, res, next) {
  try {
    const { message, history = [], city = "" } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required", code: "BAD_REQUEST" });
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

    const result = await agentService.chat({
      history,
      message,
      ctx: {
        userId: req.user.sub,
        defaultCity: city,
        today,
      },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { chat };
