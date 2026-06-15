import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import useSeatMap from "../hooks/useSeatMap";
import Nav from "../components/Nav";
import SeatGrid from "../components/SeatGrid";

/**
 * SeatPickerPage — the booking UI. Implements the design doc's hybrid
 * Optimistic UI + Short-Polling flow (3.2):
 *
 *  selecting phase:
 *    - useSeatMap polls every 5s (other people's holds/bookings appear)
 *    - clicking a green seat optimistically turns it blue (selected) instantly
 *    - "Hold N seats" → POST /bookings/hold
 *        201 → switch to "held" phase, start 5-min timer
 *        409 → flash the taken seats red, alert, refresh the map
 *
 *  held phase:
 *    - show ticket summary + "Confirm & pay" (idempotent) and "Cancel hold"
 *    - timer counts down from heldUntil; on zero the hold is gone (lazy reclaim)
 */
export default function SeatPickerPage() {
  const { showId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthed, logout } = useAuth();

  const meta = location.state || {};           // price, names, startTime (may be empty on deep-link)
  const pricePerSeat = meta.price ?? null;

  const { seats, loading, error, refresh } = useSeatMap(showId);

  const [phase, setPhase] = useState("selecting");  // "selecting" | "held"
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [flashIds, setFlashIds] = useState(new Set());
  const [booking, setBooking] = useState(null);      // hold response
  const [secsLeft, setSecsLeft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null);
  const timerRef = useRef(null);

  // ── Countdown timer for the active hold ─────────────────────────────────────
  useEffect(() => {
    if (phase !== "held" || !booking) return;
    function tick() {
      const remaining = Math.max(0, Math.floor((new Date(booking.heldUntil) - Date.now()) / 1000));
      setSecsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        setBanner({ t: "Hold expired", d: "Your 5-minute hold ran out. The seats are available again." });
        setPhase("selecting");
        setBooking(null);
        setSelectedIds(new Set());
        refresh();
      }
    }
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, booking, refresh]);

  // ── Optimistic seat toggle ──────────────────────────────────────────────────
  function toggleSeat(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 10) next.add(id);
      return next;
    });
  }

  // ── Hold ─────────────────────────────────────────────────────────────────────
  async function handleHold() {
    if (!isAuthed) {
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    const ids = [...selectedIds];
    setBusy(true);
    setBanner(null);
    try {
      const res = await api.hold(Number(showId), ids);
      // 201 → seats are ours. Switch to held phase with the 5-min timer.
      setBooking(res);
      setPhase("held");
    } catch (err) {
      if (err.status === 409) {
        // Someone else won the DB lock. Flash the taken seats red, then refresh.
        const taken = new Set(err.body?.takenIds || ids);
        setFlashIds(taken);
        setBanner({
          t: "Seats just taken",
          d: "Someone grabbed one of your seats first. Please reselect from the available ones.",
        });
        setSelectedIds(new Set());
        await refresh();
        setTimeout(() => setFlashIds(new Set()), 1500);
      } else if (err.status === 401) {
        // Session invalid/expired (e.g. logged-out, or user removed). Re-login.
        logout();
        navigate("/login", { state: { from: location.pathname } });
      } else {
        setBanner({ t: "Couldn’t hold seats", d: "Something went wrong. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  // ── Confirm (idempotent) ──────────────────────────────────────────────────────
  async function handleConfirm() {
    setBusy(true);
    try {
      await api.confirm(booking.bookingId);
      clearInterval(timerRef.current);
      navigate(`/confirmed/${booking.bookingId}`, {
        state: { ...meta, booking, total: pricePerSeat ? pricePerSeat * booking.seats.length : null },
      });
    } catch (err) {
      setBanner({ t: "Confirmation failed", d: err.message });
      setBusy(false);
    }
  }

  // ── Cancel hold ───────────────────────────────────────────────────────────────
  async function handleCancel() {
    setBusy(true);
    try {
      await api.cancel(booking.bookingId);
    } catch { /* ignore — idempotent */ }
    clearInterval(timerRef.current);
    setPhase("selecting");
    setBooking(null);
    setSelectedIds(new Set());
    setBusy(false);
    refresh();
  }

  const subBar = meta.theaterName
    ? `${meta.theaterName} · ${meta.screenName} · ${formatTime(meta.startTime)}${pricePerSeat ? ` · ₹${pricePerSeat}/seat` : ""}`
    : `Show #${showId}`;

  // ── Render: HELD phase (confirm ticket) ───────────────────────────────────────
  if (phase === "held" && booking) {
    const total = pricePerSeat ? pricePerSeat * booking.seats.length : null;
    return (
      <div className="app-shell">
        <Nav variant="inner" title="Confirm booking" timer={secsLeft} onBack={handleCancel} />
        <div className="sub-bar">{subBar}</div>
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
            Booking held — confirm before the timer runs out
          </div>
          <div className="ticket">
            {meta.movieTitle && <TicketRow k="Movie" v={meta.movieTitle} />}
            {meta.theaterName && <TicketRow k="Theater" v={meta.theaterName} />}
            {meta.screenName && <TicketRow k="Screen" v={meta.screenName} />}
            {meta.startTime && <TicketRow k="Date & time" v={formatDateTime(meta.startTime)} />}
            <TicketRow k="Seats" v={booking.seats.map((s) => `${s.row}${s.number}`).join(", ")} />
            {total != null && (
              <div className="ticket-row" style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                <span className="k" style={{ fontWeight: 600 }}>Total</span>
                <span className="v" style={{ fontSize: 15 }}>₹{total}</span>
              </div>
            )}
          </div>
        </div>
        {banner && <Banner {...banner} />}
        <div className="btn-wrap">
          <button className="btn-primary" disabled={busy} onClick={handleConfirm}>
            {busy ? "Processing…" : total != null ? `Confirm & pay · ₹${total}` : "Confirm & pay"}
          </button>
          <button className="btn-secondary" disabled={busy} onClick={handleCancel}>Cancel hold</button>
        </div>
      </div>
    );
  }

  // ── Render: SELECTING phase (seat grid) ───────────────────────────────────────
  const count = selectedIds.size;
  const total = pricePerSeat ? pricePerSeat * count : null;

  return (
    <div className="app-shell">
      <Nav variant="inner" title="Pick your seats" onBack={() => navigate(-1)} />
      <div className="sub-bar">{subBar}</div>

      <div className="seat-legend">
        <Legend color="var(--seat-available)" label="Available" />
        <Legend color="var(--seat-selected)" label="Selected" />
        <Legend color="var(--seat-held)" label="Held" />
        <Legend color="var(--seat-booked)" label="Booked" />
      </div>

      {banner && <Banner {...banner} />}

      {loading ? (
        <div className="center-msg">Loading seat map…</div>
      ) : error ? (
        <div className="center-msg">Couldn’t load seats: {error.message}</div>
      ) : (
        <SeatGrid seats={seats} selectedIds={selectedIds} flashIds={flashIds} onToggle={toggleSeat} />
      )}

      {count > 0 && (
        <div className="booking-summary">
          <div className="summary-row">
            <span>Seats</span>
            <span>{selectedSeatLabels(seats, selectedIds)}</span>
          </div>
          {pricePerSeat != null && (
            <>
              <div className="summary-row"><span>Price per seat</span><span>₹{pricePerSeat}</span></div>
              <div className="summary-row summary-total"><span>Total</span><span>₹{total}</span></div>
            </>
          )}
        </div>
      )}

      <div className="btn-wrap">
        <button className="btn-primary" disabled={count === 0 || busy} onClick={handleHold}>
          {busy ? "Holding…"
            : count === 0 ? "Select seats to continue"
            : `Hold ${count} seat${count > 1 ? "s" : ""}${total != null ? ` · ₹${total}` : ""}`}
        </button>
        {count > 0 && (
          <button className="btn-secondary" onClick={() => setSelectedIds(new Set())}>Clear selection</button>
        )}
      </div>
    </div>
  );
}

function TicketRow({ k, v }) {
  return <div className="ticket-row"><span className="k">{k}</span><span className="v">{v}</span></div>;
}
function Legend({ color, label }) {
  return <div className="legend-item"><div className="legend-dot" style={{ background: color }} />{label}</div>;
}
function Banner({ t, d }) {
  return <div className="banner-error"><div className="t">{t}</div><div className="d">{d}</div></div>;
}
function selectedSeatLabels(seats, selectedIds) {
  return seats
    .filter((s) => selectedIds.has(s.id))
    .map((s) => `${s.seat.row}${s.seat.number}`)
    .sort()
    .join(", ");
}
function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
