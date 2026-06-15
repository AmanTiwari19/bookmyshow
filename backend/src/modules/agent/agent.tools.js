/**
 * agent.tools.js
 *
 * Two things live here:
 *  1) toolDeclarations — the JSON schemas describing each tool to Gemini, so
 *     the model knows what it can call and with what arguments.
 *  2) toolImplementations — the actual JS functions. CRITICAL: these call the
 *     SAME service functions a human's HTTP request uses, so the agent inherits
 *     all the DB locking, validation and safety. There is no separate path.
 *
 * There is deliberately NO confirm/pay tool — holding seats is the furthest the
 * agent can go. A human must click "Confirm & Pay".
 */

const movieService   = require("../movies/movie.service");
const showService    = require("../shows/show.service");
const bookingService = require("../bookings/booking.service");
const { findShowById } = require("../shows/show.repository");

/** Load show context into ctx.uiState for the right-hand seat pane. */
async function ensureShowUi(ctx, showId) {
  const id = Number(showId);
  if (ctx.uiState?.currentShowId !== id) {
    ctx.uiState = {
      currentShowId: id,
      booking: null,
      suggestedSeatIds: null,
      pricePerSeat: null,
      showMeta: null,
    };
  }
  const show = await findShowById(id);
  if (show) {
    ctx.uiState.pricePerSeat = Number(show.price);
    ctx.uiState.showMeta = {
      movie: show.movie.title,
      theater: show.screen.theater.name,
      screen: show.screen.name,
      startTime: show.startTime,
    };
  }
  return ctx.uiState;
}

// ─── Tool schemas (given to Gemini) ─────────────────────────────────────────

const toolDeclarations = [
  {
    name: "search_movies",
    description:
      "Search the movie catalog by title or genre. Returns movies (with rating and duration) that are playing in the given city. Use this to find what's on.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Title or genre to search for, e.g. 'action' or 'Mortal Kombat'. Empty string returns everything." },
        city:  { type: "string", description: "City to filter by, e.g. 'Mumbai'. Defaults to the user's selected city." },
      },
      required: [],
    },
  },
  {
    name: "get_showtimes",
    description:
      "Get showtimes for a specific movie on a specific date, grouped by theater. Each show includes its showId, time, price, available seat count and screen type (Gold/IMAX/Standard). Use this to compare prices and availability across theaters.",
    parameters: {
      type: "object",
      properties: {
        movieId: { type: "integer", description: "The movie's id (from search_movies)." },
        date:    { type: "string", description: "Date as YYYY-MM-DD." },
        city:    { type: "string", description: "City to filter by. Defaults to the user's selected city." },
      },
      required: ["movieId", "date"],
    },
  },
  {
    name: "get_seat_map",
    description:
      "Get the live seat map for a show: which seats are AVAILABLE, HELD or BOOKED. Use before suggesting or holding seats. This also shows the seat map to the user on screen.",
    parameters: {
      type: "object",
      properties: {
        showId: { type: "integer", description: "The show's id." },
      },
      required: ["showId"],
    },
  },
  {
    name: "suggest_seats",
    description:
      "Pick the best N adjacent available seats for a show (prefers center rows and middle columns, all together). Returns the chosen seat ids and labels. Use this when the user wants good seats without naming them.",
    parameters: {
      type: "object",
      properties: {
        showId: { type: "integer", description: "The show's id." },
        count:  { type: "integer", description: "How many seats to pick (1-10)." },
      },
      required: ["showId", "count"],
    },
  },
  {
    name: "hold_seats",
    description:
      "Hold specific seats for the user for 5 minutes (the safe, locked booking path). Returns the bookingId. This does NOT pay — the user must click Confirm & Pay. Always confirm the seats and price with the user before calling this.",
    parameters: {
      type: "object",
      properties: {
        showId:  { type: "integer", description: "The show's id." },
        seatIds: { type: "array", items: { type: "integer" }, description: "ShowSeat ids to hold (from get_seat_map or suggest_seats)." },
      },
      required: ["showId", "seatIds"],
    },
  },
];

// ─── Tool implementations ────────────────────────────────────────────────────
//
// Each receives (args, ctx). ctx carries { userId, defaultCity } from the
// authenticated request. They return plain JSON the model can read.
// Some set ctx.uiState so the frontend knows to render the right pane.

const toolImplementations = {
  async search_movies({ query = "", city }, ctx) {
    const movies = await movieService.getAllMovies(query, city || ctx.defaultCity);
    return {
      count: movies.length,
      movies: movies.slice(0, 12).map((m) => ({
        movieId: m.id, title: m.title, genre: m.genre,
        rating: m.rating, durationMins: m.durationMins,
        posterUrl: m.posterUrl, // for rich cards in the chat
      })),
    };
  },

  async get_showtimes({ movieId, date, city }, ctx) {
    const grouped = await showService.getShowsForMovieOnDate(
      Number(movieId), date, city || ctx.defaultCity
    );
    // Look up the movie title once so the comparison card can label rows
    let movieTitle = "";
    try { movieTitle = (await movieService.getMovieById(Number(movieId))).title; } catch { /* ignore */ }

    // Flatten to a compact, comparison-friendly shape
    const shows = [];
    for (const t of grouped) {
      for (const s of t.shows) {
        shows.push({
          showId: s.id,
          movie: movieTitle,
          theater: t.theater.name,
          city: t.theater.city,
          screen: s.screen.name,
          time: new Date(s.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }),
          price: Number(s.price),
          availableSeats: s.availableSeats,
        });
      }
    }
    return { count: shows.length, shows };
  },

  async get_seat_map({ showId }, ctx) {
    await ensureShowUi(ctx, showId);
    const seats = await showService.getSeatMap(Number(showId));
    const available = seats.filter((s) => s.status === "AVAILABLE");
    return {
      showId: Number(showId),
      totalSeats: seats.length,
      availableCount: available.length,
      availableSeats: available.map((s) => ({ id: s.id, label: `${s.seat.row}${s.seat.number}` })),
    };
  },

  async suggest_seats({ showId, count }, ctx) {
    await ensureShowUi(ctx, showId);
    const seats = await showService.getSeatMap(Number(showId));
    const n = Math.max(1, Math.min(10, Number(count)));
    const block = pickBestBlock(seats, n);
    if (!block) {
      return { found: false, reason: `Couldn't find ${n} adjacent available seats.` };
    }
    ctx.uiState.suggestedSeatIds = block.map((s) => s.id);
    return {
      found: true,
      seatIds: block.map((s) => s.id),
      labels: block.map((s) => `${s.seat.row}${s.seat.number}`),
    };
  },

  async hold_seats({ showId, seatIds }, ctx) {
    if (!ctx.userId) {
      return { ok: false, error: "User must be signed in to hold seats." };
    }
    try {
      const { booking, heldUntil } = await bookingService.hold({
        showId: Number(showId),
        showSeatIds: seatIds.map(Number),
        userId: ctx.userId,
      });
      const seatLabels = booking.bookingSeats.map((bs) => `${bs.showSeat.seat.row}${bs.showSeat.seat.number}`);
      const showSeatIds = booking.bookingSeats.map((bs) => bs.showSeatId);
      ctx.uiState = {
        currentShowId: Number(showId),
        suggestedSeatIds: null,
        pricePerSeat: Number(booking.show.price),
        showMeta: {
          movie: booking.show.movie.title,
          theater: booking.show.screen.theater.name,
          screen: booking.show.screen.name,
          startTime: booking.show.startTime,
        },
        booking: {
          bookingId: booking.id,
          heldUntil,
          showSeatIds,
          seats: booking.bookingSeats.map((bs) => ({
            row: bs.showSeat.seat.row,
            number: bs.showSeat.seat.number,
            showSeatId: bs.showSeatId,
          })),
          movie: booking.show.movie.title,
          theater: booking.show.screen.theater.name,
          screen: booking.show.screen.name,
          startTime: booking.show.startTime,
          pricePerSeat: Number(booking.show.price),
        },
      };
      return { ok: true, bookingId: booking.id, heldSeats: seatLabels, heldUntil, note: "Seats held. The user must click Confirm & Pay to finish — you cannot pay for them." };
    } catch (err) {
      // 409 etc. — report cleanly so the model can recover ("try other seats")
      const code = err.code || "HOLD_FAILED";
      return {
        ok: false,
        code,
        error: err.message,
        takenSeatIds: err.takenIds || [],
        recovery: code === "SEATS_UNAVAILABLE"
          ? "Those seats were just taken by someone else. Call suggest_seats or get_seat_map to find DIFFERENT available seats, then offer them — do not retry the same seats."
          : "Tell the user the hold could not be completed.",
      };
    }
  },
};

// ─── Seat-picking helper (deterministic, not left to the LLM) ─────────────────
//
// Find N adjacent available seats in one row, scoring center rows / middle
// columns higher so "good seats" actually means good seats.
function pickBestBlock(seats, n) {
  const byRow = {};
  for (const s of seats) {
    if (s.status !== "AVAILABLE") continue;
    (byRow[s.seat.row] ||= []).push(s);
  }

  const rows = Object.keys(byRow).sort();
  const midRowIdx = (rows.length - 1) / 2;

  let best = null;
  let bestScore = -Infinity;

  rows.forEach((row, ri) => {
    const rowSeats = byRow[row].sort((a, b) => a.seat.number - b.seat.number);
    // Slide a window of n looking for consecutive seat numbers
    for (let i = 0; i + n <= rowSeats.length; i++) {
      const window = rowSeats.slice(i, i + n);
      const consecutive = window.every((s, k) => k === 0 || s.seat.number === window[k - 1].seat.number + 1);
      if (!consecutive) continue;

      const centerCol = (window[0].seat.number + window[n - 1].seat.number) / 2;
      const rowScore = -Math.abs(ri - midRowIdx);       // closer to middle row = higher
      const colScore = -Math.abs(centerCol - 5.5);       // closer to middle column = higher
      const score = rowScore * 2 + colScore;             // weight row a bit more

      if (score > bestScore) { bestScore = score; best = window; }
    }
  });

  return best;
}

module.exports = { toolDeclarations, toolImplementations };
