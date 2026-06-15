require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes    = require("./modules/auth/auth.routes");
const movieRoutes   = require("./modules/movies/movie.routes");
const showRoutes    = require("./modules/shows/show.routes");
const bookingRoutes = require("./modules/bookings/booking.routes");
const agentRoutes   = require("./modules/agent/agent.routes");
const metaRoutes    = require("./modules/meta/meta.routes");

const app = express();

// CORS:
//  - Local dev (no CORS_ORIGIN set): allow all origins, so the Vite proxy and
//    direct calls just work with zero config.
//  - Production: set CORS_ORIGIN to the deployed frontend URL to lock it down,
//    e.g. CORS_ORIGIN="https://bookmyshow-clone.vercel.app".
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin } : {}));
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Routes
app.use("/auth",     authRoutes);
app.use("/movies",   movieRoutes);
app.use("/shows", showRoutes);
app.use("/bookings", bookingRoutes);
app.use("/agent", agentRoutes);
app.use("/cities", metaRoutes);

// Global error handler — uniform { error, code } shape.
// IMPORTANT: never leak raw error messages / stack traces / file paths to the
// client. We log the full error server-side and return safe, friendly text.
app.use((err, req, res, next) => {
  // Full detail for the developer, in the server logs only
  console.error(err);

  // ── Prisma known errors → clean, user-safe messages ──────────────────────
  // P2003 = foreign key violation. The common cause here: a booking references
  // a user that no longer exists (a stale login after the DB was reseeded).
  if (err.code === "P2003") {
    return res.status(401).json({
      error: "Your session is no longer valid. Please sign in again.",
      code: "SESSION_INVALID",
    });
  }
  // P2002 = unique constraint (e.g. the BookingSeat double-booking backstop)
  if (err.code === "P2002") {
    return res.status(409).json({
      error: "That seat was just taken. Please pick another.",
      code: "SEATS_UNAVAILABLE",
    });
  }

  // ── Errors we threw on purpose carry a safe status + message ──────────────
  if (err.status && err.status < 500) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code || "ERROR",
    });
  }

  // ── Anything else is unexpected — return a generic message ────────────────
  res.status(500).json({
    error: "Something went wrong on our end. Please try again.",
    code: "INTERNAL_ERROR",
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`BMS backend running on port ${PORT}`);
});
