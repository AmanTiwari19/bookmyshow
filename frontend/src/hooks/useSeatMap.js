import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";

/**
 * useSeatMap — fetches the seat map for a show and short-polls every 5 seconds
 * to keep it fresh (design doc 3.2: hybrid Optimistic UI + Short-Polling).
 *
 * The 5s poll is how other users' holds/bookings — and expired holds being
 * reclaimed — show up without WebSockets.
 *
 * Returns { seats, loading, error, refresh }.
 */
export default function useSeatMap(showId, { intervalMs = 5000 } = {}) {
  const [seats, setSeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const firstLoad = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getSeatMap(showId);
      setSeats(data);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      if (firstLoad.current) {
        setLoading(false);
        firstLoad.current = false;
      }
    }
  }, [showId]);

  useEffect(() => {
    if (!showId) return;
    firstLoad.current = true;
    setLoading(true);
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [showId, intervalMs, refresh]);

  return { seats, loading, error, refresh };
}
