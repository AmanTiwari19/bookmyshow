/**
 * prisma/seed.js
 *
 * What this script does, in order:
 *  1. Fetch "Now Playing" movies from TMDB and insert them into Movie table.
 *  2. Create 3 Theaters, each with 2 Screens.
 *  3. For every Screen, create seats: rows A-E, seats 1-10 = 50 seats per screen.
 *  4. For every Movie × Screen combination, generate shows across the next 7 days
 *     at fixed showtimes (10:00, 14:00, 18:00, 21:30 UTC).
 *  5. For every Show, create one ShowSeat row per Seat on that Screen (the hot inventory table).
 *
 * Run: npm run seed
 * Requires: DATABASE_URL and TMDB_API_KEY in .env
 */

const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const prisma = new PrismaClient();

// ─── Config ──────────────────────────────────────────────────────────────────

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE    = "https://api.themoviedb.org/3";
const POSTER_BASE  = "https://image.tmdb.org/t/p/w500";

// Showtimes (hours in UTC) that we generate for each show day
const SHOW_HOURS = [10, 14, 18, 21]; // 10:00, 14:00, 18:00, 21:00

// How many days ahead to seed shows for
const DAYS_AHEAD = 7;

// Seat layout per screen: rows A-E, seats 1-10
const SEAT_ROWS    = ["A", "B", "C", "D", "E"];
const SEATS_PER_ROW = 10;

// Theaters to seed (real-sounding names)
// Real-sounding theaters, grouped by city. Add/remove freely — the seed
// generates screens, shows and inventory for whatever is listed here.
const CITY_THEATERS = {
  Mumbai: [
    "PVR Phoenix Marketcity", "INOX R-City Ghatkopar", "Cinepolis Andheri",
    "PVR Icon Juhu", "Carnival Cinemas Wadala", "Movietime Kandivali",
    "INOX Nariman Point", "PVR Oberoi Mall",
  ],
  Delhi: [
    "PVR Select Citywalk", "INOX Nehru Place", "Cinepolis DLF Promenade",
    "PVR Pacific Mall", "Delite Cinema", "PVR Vegas Dwarka", "INOX Janpath",
  ],
  Bangalore: [
    "PVR Forum Mall", "INOX Garuda Mall", "Cinepolis Binnypet",
    "PVR Orion Mall", "Urvashi Theatre", "INOX Mantri Square",
    "PVR Vega City",
  ],
  Hyderabad: [
    "PVR Inorbit Mall", "INOX GVK One", "Cinepolis Sudha Multiplex",
    "AMB Cinemas Gachibowli", "Prasads Multiplex", "PVR Next Galleria",
    "Asian Cinemas",
  ],
  Pune: [
    "PVR Phoenix Marketcity", "INOX Bund Garden", "Cinepolis Seasons Mall",
    "City Pride Kothrud", "E-Square Cinemas", "PVR Pavillion",
  ],
  Chennai: [
    "PVR Grand Mall", "INOX Citi Centre", "Sathyam Cinemas",
    "AGS Navalur", "Escape Express Avenue", "PVR Ampa Skywalk",
  ],
};

// Each theater gets one of these screen layouts (rotated), so theaters vary
// between 2 and 3 screens, with a mix of premium/standard for pricing.
const SCREEN_TEMPLATES = [
  ["Screen 1 - Gold", "Screen 2 - Standard"],
  ["Audi 1 - Premium", "Audi 2", "Audi 3 - Standard"],
  ["Screen 1 - IMAX", "Screen 2 - Gold", "Screen 3"],
  ["Hall A - Gold", "Hall B - Standard"],
];

function buildTheaterData() {
  const out = [];
  let i = 0;
  for (const [city, names] of Object.entries(CITY_THEATERS)) {
    for (const name of names) {
      out.push({ name, city, screens: SCREEN_TEMPLATES[i % SCREEN_TEMPLATES.length] });
      i++;
    }
  }
  return out;
}

const THEATER_DATA = buildTheaterData();

// ─── TMDB helpers ─────────────────────────────────────────────────────────────

/**
 * Map TMDB genre IDs to human-readable names.
 * (TMDB returns genre_ids[], not names, in the now_playing list endpoint.)
 */
const GENRE_MAP = {
  28:    "Action",
  12:    "Adventure",
  16:    "Animation",
  35:    "Comedy",
  80:    "Crime",
  99:    "Documentary",
  18:    "Drama",
  10751: "Family",
  14:    "Fantasy",
  36:    "History",
  27:    "Horror",
  10402: "Music",
  9648:  "Mystery",
  10749: "Romance",
  878:   "Sci-Fi",
  10770: "TV Movie",
  53:    "Thriller",
  10752: "War",
  37:    "Western",
};

async function fetchNowPlayingMovies() {
  console.log("📡  Fetching Now Playing movies from TMDB...");

  const url = `${TMDB_BASE}/movie/now_playing?api_key=${TMDB_API_KEY}&language=en-US&page=1`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`TMDB request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  console.log(`   Found ${data.results.length} movies on TMDB.`);

  // Map to our Movie shape; skip entries with no poster
  return data.results
    .filter((m) => m.poster_path)
    .map((m) => ({
      title:       m.title,
      description: m.overview || "No description available.",
      posterUrl:   `${POSTER_BASE}${m.poster_path}`,
      genre:       GENRE_MAP[m.genre_ids?.[0]] ?? "Drama", // take the first genre
      durationMins: Math.floor(Math.random() * 60) + 90,   // TMDB now_playing doesn't include runtime; randomise 90-149 min
      rating:      m.vote_average ? Math.round(m.vote_average * 10) / 10 : null, // TMDB 0-10 score, 1 decimal
    }));
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Return Date objects for the next N days, starting from today (UTC midnight). */
function upcomingDays(n) {
  const days = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() + i);
    days.push(d);
  }
  return days;
}

// ─── Main seed ────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🌱  Starting seed...\n");

  // ── 1. Wipe existing data (order matters — child tables first) ─────────────
  console.log("🗑   Clearing existing data...");
  await prisma.bookingSeat.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.showSeat.deleteMany();
  await prisma.show.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.screen.deleteMany();
  await prisma.theater.deleteMany();
  await prisma.movie.deleteMany();
  await prisma.user.deleteMany();
  console.log("   Done.\n");

  // ── 2. Fetch movies from TMDB ──────────────────────────────────────────────
  const tmdbMovies = await fetchNowPlayingMovies();

  // Cap the catalog (TMDB "now playing" page 1 returns ~20)
  const moviesToInsert = tmdbMovies.slice(0, 15);

  console.log(`🎬  Inserting ${moviesToInsert.length} movies...`);
  const movies = await Promise.all(
    moviesToInsert.map((m) => prisma.movie.create({ data: m }))
  );
  console.log(`   Inserted: ${movies.map((m) => m.title).join(", ")}\n`);

  // ── 3. Create Theaters → Screens → Seats ──────────────────────────────────
  console.log("🏟   Creating theaters, screens, and seats...");

  const screens = []; // we'll use this to schedule shows

  for (const tData of THEATER_DATA) {
    const theater = await prisma.theater.create({
      data: { name: tData.name, city: tData.city },
    });

    for (const screenName of tData.screens) {
      const screen = await prisma.screen.create({
        data: { name: screenName, theaterId: theater.id },
      });

      // Create seats A1-A10, B1-B10 ... E1-E10
      const seatData = [];
      for (const row of SEAT_ROWS) {
        for (let num = 1; num <= SEATS_PER_ROW; num++) {
          seatData.push({ row, number: num, screenId: screen.id });
        }
      }
      await prisma.seat.createMany({ data: seatData });

      // Fetch back the created seats (we need their IDs later)
      const createdSeats = await prisma.seat.findMany({
        where: { screenId: screen.id },
      });

      screens.push({ screen, theater, seats: createdSeats });
    }
  }

  const totalSeats = screens.reduce((sum, s) => sum + s.seats.length, 0);
  console.log(
    `   Created ${screens.length} screens across ${THEATER_DATA.length} theaters (${totalSeats} seats total).\n`
  );

  // ── 4. Create Shows (Movie × Screen × Day × Showtime) ─────────────────────
  console.log("📅  Generating shows for the next", DAYS_AHEAD, "days...");

  const days = upcomingDays(DAYS_AHEAD);

  // Assign each screen a rotating subset of movies so not every theater plays
  // every movie — more realistic. We'll spread movies round-robin.
  //
  // Performance note: at this scale (dozens of theaters) we avoid one-query-
  // per-show. Instead we bulk-insert all of a screen's shows with
  // createManyAndReturn (gives us back the generated ids), then buffer the
  // ShowSeat rows and flush them in large chunks.
  let movieIndex = 0;
  let showCount  = 0;

  const SHOWSEAT_CHUNK = 5000;
  let showSeatBuffer = [];
  async function flushShowSeats() {
    if (showSeatBuffer.length === 0) return;
    await prisma.showSeat.createMany({ data: showSeatBuffer });
    showSeatBuffer = [];
  }

  for (const { screen, seats } of screens) {
    // Pick 2 movies per screen
    const moviesForScreen = [];
    for (let i = 0; i < 2; i++) {
      moviesForScreen.push(movies[movieIndex % movies.length]);
      movieIndex++;
    }

    // Build every show row for this screen first
    const showRows = [];
    for (const movie of moviesForScreen) {
      for (const day of days) {
        for (const hour of SHOW_HOURS) {
          const startTime = new Date(day);
          startTime.setUTCHours(hour, 0, 0, 0);

          // Ticket price varies by screen type and time
          const isEvening = hour >= 18;
          const isPremium = /gold|premium|imax/i.test(screen.name);
          const price = isPremium
            ? (isEvening ? 450 : 350)
            : (isEvening ? 300 : 200);

          showRows.push({ movieId: movie.id, screenId: screen.id, startTime, price });
        }
      }
    }

    // Bulk-insert shows and get their ids back
    const createdShows = await prisma.show.createManyAndReturn({ data: showRows });
    showCount += createdShows.length;

    // ── 5. Buffer ShowSeat inventory (one row per seat per show) ──────────────
    for (const show of createdShows) {
      for (const seat of seats) {
        showSeatBuffer.push({ showId: show.id, seatId: seat.id, status: "AVAILABLE" });
      }
      if (showSeatBuffer.length >= SHOWSEAT_CHUNK) await flushShowSeats();
    }
  }
  await flushShowSeats();

  console.log(`   Created ${showCount} shows.\n`);

  // ── 6. Summary ─────────────────────────────────────────────────────────────
  const counts = {
    movies:    await prisma.movie.count(),
    theaters:  await prisma.theater.count(),
    screens:   await prisma.screen.count(),
    seats:     await prisma.seat.count(),
    shows:     await prisma.show.count(),
    showSeats: await prisma.showSeat.count(),
  };

  console.log("✅  Seed complete!\n");
  console.log("   Database summary:");
  console.log(`     Movies    : ${counts.movies}`);
  console.log(`     Theaters  : ${counts.theaters}`);
  console.log(`     Screens   : ${counts.screens}`);
  console.log(`     Seats     : ${counts.seats}`);
  console.log(`     Shows     : ${counts.shows}`);
  console.log(`     ShowSeats : ${counts.showSeats}`);
  console.log("\n   Run `npm run dev` to start the API.");
}

main()
  .catch((e) => {
    console.error("❌  Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
