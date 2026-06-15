import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useCity } from "../city";
import Nav from "../components/Nav";
import DateStrip, { todayIso } from "../components/DateStrip";

/**
 * ShowSelectionPage — movie hero + date strip + theaters with showtime pills.
 * Backend already groups shows by theater (GET /shows?movieId=&date=).
 * Picking a showtime navigates to the seat picker.
 */
export default function ShowSelectionPage() {
  const { movieId } = useParams();
  const navigate = useNavigate();
  const { city } = useCity();
  const [searchParams, setSearchParams] = useSearchParams();
  const date = searchParams.get("date") || todayIso();

  const [movie, setMovie] = useState(null);
  const [theaters, setTheaters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Movie hero — fetched once
  useEffect(() => {
    api.getMovie(movieId).then(setMovie).catch(() => {});
  }, [movieId]);

  // Shows — refetched whenever the date OR selected city changes
  useEffect(() => {
    setLoading(true);
    api.getShows(movieId, date, city)
      .then((data) => { setTheaters(data); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [movieId, date, city]);

  function selectDate(iso) {
    setSearchParams({ date: iso });
  }

  return (
    <div className="app-shell">
      <Nav variant="inner" title="Book tickets" onBack={() => navigate("/")} />

      {movie && (
        <div className="movie-hero">
          {movie.posterUrl
            ? <img className="hero-poster hero-poster-lg" src={movie.posterUrl} alt={movie.title} />
            : <div className="hero-poster hero-poster-lg" />}
          <div className="hero-details">
            <div className="title">{movie.title}</div>
            {movie.rating != null && (
              <div className="hero-rating">
                <span className="star">★</span> {movie.rating.toFixed(1)}<span className="rating-max">/10</span>
              </div>
            )}
            <div className="sub">{movie.genre} · {movie.durationMins} mins</div>
            {movie.description && <p className="hero-synopsis">{movie.description}</p>}
            <div className="tags"><span className="tag tag-genre">{movie.genre}</span></div>
          </div>
        </div>
      )}

      <DateStrip selected={date} onSelect={selectDate} />

      {loading ? (
        <div style={{ padding: 18 }}>
          {[0, 1].map((i) => (
            <div key={i} className="theater-card" style={{ padding: 14 }}>
              <div className="shimmer" style={{ height: 14, width: "40%", marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 10 }}>
                <div className="shimmer" style={{ width: 84, height: 50, borderRadius: 6 }} />
                <div className="shimmer" style={{ width: 84, height: 50, borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="center-msg">Couldn’t load showtimes: {error}</div>
      ) : theaters.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🎭</div>
          <div className="title">No shows on this date</div>
          <div>Try a different day from the strip above</div>
        </div>
      ) : (
        <>
          <div className="section-label">{theaters.length} cinema{theaters.length > 1 ? "s" : ""}{city ? ` in ${city}` : ""}</div>
          {theaters.map((t) => (
            <div className="theater-card" key={t.theater.id}>
              <div className="theater-header">
                <div>
                  <div className="theater-name">{t.theater.name}</div>
                  <div className="theater-meta">{t.theater.city}</div>
                </div>
              </div>
              <div className="shows-row">
                {t.shows.map((s) => {
                  const houseful = s.availableSeats === 0;
                  return (
                    <div
                      key={s.id}
                      className={`show-pill ${houseful ? "houseful" : ""}`}
                      onClick={() => !houseful && navigate(`/shows/${s.id}/seats`, {
                        state: {
                          price: Number(s.price),
                          movieTitle: movie?.title,
                          theaterName: t.theater.name,
                          city: t.theater.city,
                          screenName: s.screen.name,
                          startTime: s.startTime,
                        },
                      })}
                    >
                      <div className="show-time">{formatTime(s.startTime)}</div>
                      <div className="show-avail" style={{ color: availColor(s.availableSeats) }}>
                        {houseful ? "Houseful" : `${s.availableSeats} left`}
                      </div>
                      <div className="show-price">₹{Number(s.price)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function availColor(n) {
  if (n === 0) return "var(--avail-no)";
  if (n <= 10) return "var(--avail-low)";
  return "var(--avail-ok)";
}
