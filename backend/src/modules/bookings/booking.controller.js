const { hold, confirm, cancel, listForUser } = require("./booking.service");

// GET /bookings — all bookings for the logged-in user
async function listBookings(req, res, next) {
  try {
    const bookings = await listForUser(req.user.sub);
    res.json(bookings);
  } catch (err) {
    next(err);
  }
}

// POST /bookings/hold
// Body: { showId: number, showSeatIds: number[] }
// Auth: required (req.user.sub = userId)
async function holdSeats(req, res, next) {
  try {
    const userId = req.user.sub;
    const { showId, showSeatIds } = req.body;

    const { booking, heldUntil } = await hold({ showId, showSeatIds, userId });

    res.status(201).json({
      bookingId: booking.id,
      status:    booking.status,
      heldUntil,
      show: {
        id:        booking.show.id,
        startTime: booking.show.startTime,
        movie:     booking.show.movie.title,
        screen:    booking.show.screen.name,
        theater:   booking.show.screen.theater.name,
      },
      seats: booking.bookingSeats.map((bs) => ({
        showSeatId: bs.showSeatId,
        row:        bs.showSeat.seat.row,
        number:     bs.showSeat.seat.number,
      })),
    });
  } catch (err) {
    // Map SEATS_UNAVAILABLE to 409 explicitly — other errors fall through to
    // the global error handler in index.js
    if (err.code === "SEATS_UNAVAILABLE") {
      return res.status(409).json({
        error:    err.message,
        code:     err.code,
        takenIds: err.takenIds || [],
      });
    }
    next(err);
  }
}

// POST /bookings/:id/confirm
async function confirmBooking(req, res, next) {
  try {
    const userId    = req.user.sub;
    const bookingId = Number(req.params.id);

    const booking = await confirm({ bookingId, userId });

    res.json({
      bookingId: booking.id,
      status:    booking.status,
      seats: booking.bookingSeats.map((bs) => ({
        row:    bs.showSeat.seat.row,
        number: bs.showSeat.seat.number,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// POST /bookings/:id/cancel
async function cancelBooking(req, res, next) {
  try {
    const userId    = req.user.sub;
    const bookingId = Number(req.params.id);

    const result = await cancel({ bookingId, userId });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { holdSeats, confirmBooking, cancelBooking, listBookings };
