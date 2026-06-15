const { Router }                              = require("express");
const requireAuth                             = require("../../middleware/requireAuth");
const { holdSeats, confirmBooking, cancelBooking, listBookings } = require("./booking.controller");

const router = Router();

// GET  /bookings             — list the logged-in user's bookings
// POST /bookings/hold         — lock N seats, returns 201 or 409
// POST /bookings/:id/confirm  — mark BOOKED (idempotent)
// POST /bookings/:id/cancel   — release seats back to AVAILABLE
router.get("/",             requireAuth, listBookings);
router.post("/hold",        requireAuth, holdSeats);
router.post("/:id/confirm", requireAuth, confirmBooking);
router.post("/:id/cancel",  requireAuth, cancelBooking);

module.exports = router;
