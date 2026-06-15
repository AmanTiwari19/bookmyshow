import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { useCity } from "../city";

/**
 * Top red nav bar. Two modes:
 *  - home: logo + search + city + user
 *  - inner pages: back button + title (+ optional timer slot via children)
 */
export default function Nav({ variant = "home", title, search, onSearch, timer, onBack }) {
  const navigate = useNavigate();
  const { user, isAuthed, logout } = useAuth();
  const { city, cities, setCity } = useCity();

  if (variant === "inner") {
    return (
      <div className="nav">
        <button className="nav-back" onClick={onBack || (() => navigate(-1))}>← Back</button>
        <span className="nav-title">{title}</span>
        {timer != null ? (
          <span className={`nav-timer ${timer <= 30 ? "danger" : ""}`}>{formatTimer(timer)}</span>
        ) : (
          <span style={{ width: 48 }} />
        )}
      </div>
    );
  }

  return (
    <div className="nav">
      <span className="nav-logo" onClick={() => navigate("/")}>BookMyShow</span>
      {onSearch && (
        <input
          className="nav-search"
          placeholder="Search movies by title or genre..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      )}
      <select
        className="nav-city-select"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        title="Choose your city"
      >
        {cities.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <span className="nav-assistant" onClick={() => navigate("/agent")}>✨ Assistant</span>
      {isAuthed ? (
        <>
          <span className="nav-user" onClick={() => navigate("/bookings")}>My Bookings</span>
          <span className="nav-user" onClick={logout} title="Click to log out">
            {user?.name} · Logout
          </span>
        </>
      ) : (
        <span className="nav-user" onClick={() => navigate("/login")}>Sign in</span>
      )}
    </div>
  );
}

function formatTimer(secs) {
  const m = Math.floor(secs / 60);
  const s = String(secs % 60).padStart(2, "0");
  return `${m}:${s}`;
}
