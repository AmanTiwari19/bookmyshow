import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Nav from "../components/Nav";

/**
 * MyBookingsPage — lists the logged-in user's bookings (GET /bookings).
 * Requires auth; redirects to /login if not signed in.
 */
export default function MyBookingsPage() {
  const navigate = useNavigate();
  const { isAuthed } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAuthed) {
      navigate("/login", { state: { from: "/bookings" } });
      return;
    }
    api.getBookings()
      .then((data) => { setBookings(data); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isAuthed, navigate]);

  return (
    <div className="app-shell">
      <Nav variant="inner" title="My Bookings" onBack={() => navigate("/")} />

      {loading ? (
        <div className="center-msg">Loading your bookings…</div>
      ) : error ? (
        <div className="center-msg">Couldn’t load bookings: {error}</div>
      ) : bookings.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🎟️</div>
          <div className="title">No bookings yet</div>
          <div>Book a movie and it’ll show up here.</div>
          <button className="btn-primary" style={{ maxWidth: 220, margin: "20px auto 0" }} onClick={() => navigate("/")}>
            Browse movies
          </button>
        </div>
      ) : (
        <div className="bookings-list">
          {bookings.map((b) => (
            <div className="booking-card" key={b.bookingId}>
              {b.posterUrl
                ? <img className="booking-poster" src={b.posterUrl} alt={b.movie} />
                : <div className="booking-poster" />}
              <div className="booking-body">
                <div className="booking-top">
                  <div className="booking-movie">{b.movie}</div>
                  <span className={`status-badge status-${b.status.toLowerCase()}`}>{b.status}</span>
                </div>
                <div className="booking-meta">{b.theater} · {b.screen} · {b.city}</div>
                <div className="booking-meta">{formatDateTime(b.startTime)}</div>
                <div className="booking-seats">
                  <span>Seats: <strong>{b.seats.join(", ")}</strong></span>
                  <span className="booking-total">₹{b.price * b.seats.length}</span>
                </div>
                <div className="booking-id">Booking #BMS-{b.bookingId}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-US", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
