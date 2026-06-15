/**
 * booking.service.js
 *
 * Thin orchestration layer. All the real logic lives in booking.repository.js.
 * The service's job is input validation before touching the database.
 */

const {
  holdSeats,
  confirmBooking,
  cancelBooking,
  getBookingById,
  findBookingsByUser,
} = require("./booking.repository");

/**
 * Return all of a user's bookings, shaped for the My Bookings page.
 */
async function listForUser(userId) {
  const bookings = await findBookingsByUser(userId);
  return bookings.map((b) => ({
    bookingId: b.id,
    status:    b.status,
    createdAt: b.createdAt,
    movie:     b.show.movie.title,
    posterUrl: b.show.movie.posterUrl,
    theater:   b.show.screen.theater.name,
    city:      b.show.screen.theater.city,
    screen:    b.show.screen.name,
    startTime: b.show.startTime,
    price:     Number(b.show.price),
    seats:     b.bookingSeats.map((bs) => `${bs.showSeat.seat.row}${bs.showSeat.seat.number}`),
  }));
}

async function hold({ showId, showSeatIds, userId }) {
  if (!showId || !Array.isArray(showSeatIds) || showSeatIds.length === 0) {
    const err = new Error("showId and a non-empty showSeatIds array are required");
    err.status = 400; err.code = "BAD_REQUEST";
    throw err;
  }
  if (showSeatIds.length > 10) {
    const err = new Error("Cannot hold more than 10 seats at once");
    err.status = 400; err.code = "BAD_REQUEST";
    throw err;
  }

  // Ensure all IDs are integers (guard against string injection from JSON)
  const seatIds = showSeatIds.map(Number);
  if (seatIds.some(isNaN)) {
    const err = new Error("showSeatIds must all be integers");
    err.status = 400; err.code = "BAD_REQUEST";
    throw err;
  }

  return holdSeats({ showId: Number(showId), showSeatIds: seatIds, userId });
}

async function confirm({ bookingId, userId }) {
  return confirmBooking({ bookingId: Number(bookingId), userId });
}

async function cancel({ bookingId, userId }) {
  return cancelBooking({ bookingId: Number(bookingId), userId });
}

module.exports = { hold, confirm, cancel, listForUser };
