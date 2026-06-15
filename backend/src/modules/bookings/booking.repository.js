/**
 * booking.repository.js
 *
 * This file contains the three core booking operations.
 * The most important function is holdSeats() — read the inline comments carefully.
 *
 * Key design decisions (from the architecture doc):
 *  - Pessimistic locking: SELECT ... FOR UPDATE acquires a write-lock on rows,
 *    forcing concurrent requests to queue rather than race.
 *  - ORDER BY id: consistent lock ordering across all transactions prevents deadlocks.
 *  - All-or-nothing: all N seats are checked BEFORE any are written.
 *    One taken seat → entire transaction rolls back → no partial holds.
 *  - Lazy reclaim: expired holds (heldUntil < now) are treated as AVAILABLE
 *    inside the transaction — no background cleanup job needed.
 *  - DB backstop: BookingSeat has @@unique([showSeatId]), so even if the
 *    application logic somehow let two transactions through, the database
 *    itself would reject the second INSERT.
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const HOLD_MINUTES = 5;

// ─── holdSeats ────────────────────────────────────────────────────────────────

/**
 * Attempt to hold N seats for a user in one atomic transaction.
 *
 * Returns { booking, heldUntil } on success.
 * Throws a structured error (with .status and .code) on any failure.
 *
 * @param {number}   showId
 * @param {number[]} showSeatIds  — array of ShowSeat.id values to hold
 * @param {number}   userId
 */
async function holdSeats({ showId, showSeatIds, userId }) {
  return prisma.$transaction(async (tx) => {

    // ── STEP 1: SELECT ... FOR UPDATE ────────────────────────────────────────
    //
    // We use raw SQL here because Prisma's ORM query builder has no FOR UPDATE
    // clause. Everything else in this function uses the Prisma ORM — this is
    // the only raw query in the codebase.
    //
    // FOR UPDATE:
    //   PostgreSQL takes a row-level write lock on every returned row.
    //   A second transaction trying to lock the same rows will BLOCK here
    //   (not fail — block and wait) until this transaction commits or rolls back.
    //   When it unblocks it re-reads the rows and sees the updated status.
    //
    // ORDER BY id:
    //   If User A wants seats [7, 3] and User B wants seats [3, 7], without
    //   ordering A might lock 7 while B locks 3 — circular wait → deadlock.
    //   Locking in the same id order every time breaks the cycle.
    //
    // The Prisma.$queryRaw tagged template handles parameterisation safely.
    // ANY(...)::int[] is the PostgreSQL idiom for "id IN (array)".
    //
    const locked = await tx.$queryRaw`
      SELECT id, status, "heldUntil", "heldBy", "showId"
      FROM   "ShowSeat"
      WHERE  id = ANY(${showSeatIds}::int[])
      ORDER  BY id
      FOR UPDATE
    `;

    // ── STEP 2: Validate we got exactly the rows we requested ────────────────
    //
    // If the caller sent a non-existent showSeatId the query just skips it,
    // so we check count to detect that case early.
    //
    if (locked.length !== showSeatIds.length) {
      const err = new Error("One or more seat IDs not found");
      err.status = 404; err.code = "SEATS_NOT_FOUND";
      throw err;
    }

    // ── STEP 3: Validate every seat belongs to the requested show ─────────────
    //
    // Prevents a user from holding seats from Show #99 by passing showSeatIds
    // that belong to Show #100 while claiming showId=100.
    //
    const wrongShow = locked.find((r) => Number(r.showId) !== showId);
    if (wrongShow) {
      const err = new Error("A requested seat does not belong to this show");
      err.status = 400; err.code = "SEAT_SHOW_MISMATCH";
      throw err;
    }

    // ── STEP 4: Availability check with lazy reclaim ──────────────────────────
    //
    // A seat is considered FREE if:
    //   a) status is AVAILABLE, OR
    //   b) status is HELD but heldUntil has passed (expired hold).
    //      The expired hold is reclaimed right here, inside the transaction,
    //      with no background job or cron.
    //
    // A seat is TAKEN if:
    //   a) status is BOOKED (permanent), OR
    //   b) status is HELD with a heldUntil still in the future.
    //
    const now   = new Date();
    const taken = locked.filter((row) => {
      if (row.status === "AVAILABLE") return false;
      if (row.status === "HELD" && row.heldUntil && new Date(row.heldUntil) < now) {
        return false; // ← expired hold, treat as free
      }
      return true;    // ← BOOKED, or HELD with live timer
    });

    // ALL-OR-NOTHING: if even one seat is taken, reject the entire request.
    // We have not written anything yet, so rolling back costs nothing.
    if (taken.length > 0) {
      const err = new Error(
        `${taken.length} seat(s) are no longer available`
      );
      err.status = 409; err.code = "SEATS_UNAVAILABLE";
      err.takenIds = taken.map((r) => Number(r.id));
      throw err;
    }

    // ── STEP 4b: Clear stale BookingSeat links ───────────────────────────────
    //
    // Cancel/expired holds can leave BookingSeat rows while ShowSeat is free.
    // showSeatId is @@unique, so those rows block a new hold INSERT.
    //
    const linked = await tx.bookingSeat.findMany({
      where:   { showSeatId: { in: showSeatIds } },
      include: { booking: { select: { status: true } } },
    });
    const staleSeatIds = linked
      .filter((bs) => bs.booking.status !== "BOOKED")
      .map((bs) => bs.showSeatId);
    if (staleSeatIds.length > 0) {
      await releaseBookingSeatsForShowSeats(tx, staleSeatIds);
    }

    // ── STEP 5: Write — mark seats HELD ──────────────────────────────────────
    //
    // All N seats are free. Now we write. Any crash or exception after this
    // point rolls back both this update AND the booking insert below.
    //
    const heldUntil = new Date(now.getTime() + HOLD_MINUTES * 60 * 1000);

    await tx.showSeat.updateMany({
      where: { id: { in: showSeatIds } },
      data: {
        status:    "HELD",
        heldBy:    userId,
        heldUntil,
        version:   { increment: 1 }, // ADR-1: version column for future optimistic lock
      },
    });

    // ── STEP 6: Create Booking + BookingSeat records ──────────────────────────
    //
    // Booking row = the "header" (who, which show, what status).
    // BookingSeat rows = the join table linking Booking ↔ ShowSeat.
    //
    // BookingSeat.showSeatId has a @@unique constraint — the database-level
    // backstop that prevents the same seat ever appearing in two bookings,
    // even if application logic somehow let two transactions through.
    //
    const booking = await tx.booking.create({
      data: {
        userId,
        showId,
        status: "HELD",
        bookingSeats: {
          create: showSeatIds.map((showSeatId) => ({ showSeatId })),
        },
      },
      include: {
        bookingSeats: {
          include: {
            showSeat: { include: { seat: true } },
          },
        },
        show: {
          include: {
            movie:  true,
            screen: { include: { theater: true } },
          },
        },
      },
    });

    // Transaction commits here. The row locks are released.
    // The HELD status is now persisted — locks lasted milliseconds, not minutes.
    return { booking, heldUntil };

  }, { timeout: 10_000 }); // fail if the transaction takes longer than 10s
}

// ─── confirmBooking ───────────────────────────────────────────────────────────

/**
 * Confirm a held booking → mark it BOOKED.
 *
 * Idempotent: calling confirm on an already-BOOKED booking returns 200, not an error.
 * This lets the client safely retry if a network error swallows the first response.
 *
 * @param {number} bookingId
 * @param {number} userId
 */
async function confirmBooking({ bookingId, userId }) {
  return prisma.$transaction(async (tx) => {

    const booking = await tx.booking.findUnique({
      where:   { id: bookingId },
      include: { bookingSeats: true },
    });

    if (!booking) {
      const err = new Error("Booking not found");
      err.status = 404; err.code = "NOT_FOUND";
      throw err;
    }

    // Ownership check — users can only confirm their own bookings
    if (booking.userId !== userId) {
      const err = new Error("Forbidden");
      err.status = 403; err.code = "FORBIDDEN";
      throw err;
    }

    // ── Idempotency ───────────────────────────────────────────────────────────
    // Already confirmed → return current state, no error.
    // This handles the "payment button double-clicked" case safely.
    if (booking.status === "BOOKED") {
      return tx.booking.findUnique({
        where:   { id: bookingId },
        include: {
          bookingSeats: { include: { showSeat: { include: { seat: true } } } },
          show: { include: { movie: true, screen: { include: { theater: true } } } },
        },
      });
    }

    if (booking.status === "CANCELLED") {
      const err = new Error("Cannot confirm a cancelled booking");
      err.status = 409; err.code = "BOOKING_CANCELLED";
      throw err;
    }

    // ── Check hold hasn't expired ─────────────────────────────────────────────
    const showSeatIds = booking.bookingSeats.map((bs) => bs.showSeatId);
    const showSeats   = await tx.showSeat.findMany({
      where: { id: { in: showSeatIds } },
    });

    const now     = new Date();
    const expired = showSeats.find(
      (ss) => ss.status === "HELD" && ss.heldUntil && new Date(ss.heldUntil) < now
    );
    if (expired) {
      const err = new Error("Hold has expired — please select seats again");
      err.status = 409; err.code = "HOLD_EXPIRED";
      throw err;
    }

    // ── Write ─────────────────────────────────────────────────────────────────
    // Mark ShowSeats BOOKED (permanent — status will never go back to AVAILABLE)
    await tx.showSeat.updateMany({
      where: { id: { in: showSeatIds } },
      data:  { status: "BOOKED", heldBy: null, heldUntil: null },
    });

    // Mark Booking BOOKED
    await tx.booking.update({
      where: { id: bookingId },
      data:  { status: "BOOKED" },
    });

    return tx.booking.findUnique({
      where:   { id: bookingId },
      include: {
        bookingSeats: { include: { showSeat: { include: { seat: true } } } },
        show: { include: { movie: true, screen: { include: { theater: true } } } },
      },
    });
  });
}

// ─── cancelBooking ────────────────────────────────────────────────────────────

/**
 * Cancel a held booking and release the seats back to AVAILABLE.
 *
 * Idempotent: cancelling an already-cancelled booking is a no-op.
 * Cannot cancel a BOOKED (confirmed) booking — that would need a refund flow.
 *
 * @param {number} bookingId
 * @param {number} userId
 */
async function cancelBooking({ bookingId, userId }) {
  return prisma.$transaction(async (tx) => {

    const booking = await tx.booking.findUnique({
      where:   { id: bookingId },
      include: { bookingSeats: true },
    });

    if (!booking) {
      const err = new Error("Booking not found");
      err.status = 404; err.code = "NOT_FOUND";
      throw err;
    }

    if (booking.userId !== userId) {
      const err = new Error("Forbidden");
      err.status = 403; err.code = "FORBIDDEN";
      throw err;
    }

    // Idempotent cancel
    if (booking.status === "CANCELLED") {
      return { message: "Booking already cancelled" };
    }

    if (booking.status === "BOOKED") {
      const err = new Error("Cannot cancel a confirmed booking");
      err.status = 409; err.code = "ALREADY_BOOKED";
      throw err;
    }

    const showSeatIds = booking.bookingSeats.map((bs) => bs.showSeatId);

    // Drop BookingSeat rows so the same seats can be held again (showSeatId is unique).
    await tx.bookingSeat.deleteMany({ where: { bookingId } });

    // Release seats back to AVAILABLE so other users can book them
    await tx.showSeat.updateMany({
      where: { id: { in: showSeatIds } },
      data:  { status: "AVAILABLE", heldBy: null, heldUntil: null },
    });

    await tx.booking.update({
      where: { id: bookingId },
      data:  { status: "CANCELLED" },
    });

    return { message: "Booking cancelled", bookingId };
  });
}

// ─── getBookingById ───────────────────────────────────────────────────────────

/**
 * Fetch a single booking with full details (used by confirm/cancel responses).
 */
async function getBookingById(bookingId) {
  return prisma.booking.findUnique({
    where:   { id: bookingId },
    include: {
      bookingSeats: { include: { showSeat: { include: { seat: true } } } },
      show: { include: { movie: true, screen: { include: { theater: true } } } },
    },
  });
}

// ─── findBookingsByUser ─────────────────────────────────────────────────────────

/**
 * All bookings for a user, newest first, with full movie/theater/seat details.
 * Powers the "My Bookings" page.
 */
async function findBookingsByUser(userId) {
  return prisma.booking.findMany({
    where:   { userId },
    orderBy: { createdAt: "desc" },
    include: {
      bookingSeats: { include: { showSeat: { include: { seat: true } } } },
      show: { include: { movie: true, screen: { include: { theater: true } } } },
    },
  });
}

/**
 * Remove BookingSeat links for the given show seats and cancel any HELD
 * bookings that no longer reference seats. Required because showSeatId is unique.
 */
async function releaseBookingSeatsForShowSeats(tx, showSeatIds) {
  const stale = await tx.bookingSeat.findMany({
    where:   { showSeatId: { in: showSeatIds } },
    select:  { bookingId: true },
  });
  if (stale.length === 0) return;

  const bookingIds = [...new Set(stale.map((s) => s.bookingId))];

  await tx.bookingSeat.deleteMany({ where: { showSeatId: { in: showSeatIds } } });

  await tx.booking.updateMany({
    where: { id: { in: bookingIds }, status: "HELD" },
    data:  { status: "CANCELLED" },
  });
}

module.exports = { holdSeats, confirmBooking, cancelBooking, getBookingById, findBookingsByUser };
