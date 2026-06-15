import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useCity } from "../city";
import Nav from "../components/Nav";
import DateStrip, { todayIso } from "../components/DateStrip";
import MovieCard from "../components/MovieCard";

/**
 * HomePage — browse movies (GET /movies), search by title/genre, and pick a date.
 * Clicking a movie carries the selected date into the show-selection page.
 */
export default function HomePage() {
  const navigate = useNavigate();
  const { city } = useCity();
  const [search, setSearch] = useState("");
  const [date, setDate] = useState(todayIso());
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Debounced search → GET /movies?search=&city=
  // Refetches whenever the search term OR the selected city changes.
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api.getMovies(search, city)
        .then((data) => { setMovies(data); setError(null); })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [search, city]);

  return (
    <div className="app-shell">
      <Nav search={search} onSearch={setSearch} />
      <DateStrip selected={date} onSelect={setDate} />

      {loading ? (
        <div className="movie-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="movie-card">
              <div className="shimmer" style={{ aspectRatio: "2/3" }} />
              <div style={{ padding: 10 }}>
                <div className="shimmer" style={{ height: 13, width: "70%", marginBottom: 6 }} />
                <div className="shimmer" style={{ height: 11, width: "40%" }} />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="center-msg">Couldn’t load movies: {error}</div>
      ) : movies.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🔍</div>
          <div className="title">No movies match “{search}”</div>
          <div>Try a different title or genre</div>
        </div>
      ) : (
        <>
        <div className="section-label">{search ? `Results for “${search}”` : `Now showing${city ? ` in ${city}` : ""}`}</div>
        <div className="movie-grid">
          {movies.map((m) => (
            <MovieCard
              key={m.id}
              movie={m}
              onClick={() => navigate(`/movies/${m.id}?date=${date}`)}
            />
          ))}
        </div>
        </>
      )}
    </div>
  );
}
