/**
 * MovieCard — poster + title + genre/duration. Clicking navigates to the
 * show-selection page. Poster loads directly from the TMDB URL (design doc
 * 3.1: images are never proxied through the backend).
 */
export default function MovieCard({ movie, onClick }) {
  return (
    <div className="movie-card" onClick={onClick}>
      {movie.posterUrl ? (
        <img className="movie-poster" src={movie.posterUrl} alt={movie.title} loading="lazy" />
      ) : (
        <div className="movie-poster-fallback">🎬</div>
      )}
      <div className="movie-info">
        <div className="movie-title" title={movie.title}>{movie.title}</div>
        <div className="movie-meta">
          <span className="tag tag-genre">{movie.genre}</span>
          <span>· {movie.durationMins}m</span>
          {movie.rating != null && (
            <span className="movie-rating"><span className="star">★</span>{movie.rating.toFixed(1)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
