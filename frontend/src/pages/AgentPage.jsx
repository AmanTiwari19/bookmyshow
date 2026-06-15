import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useCity } from "../city";
import Nav from "../components/Nav";
import SeatGrid from "../components/SeatGrid";
import useSeatMap from "../hooks/useSeatMap";

/**
 * AgentPage — the split-screen AI assistant.
 *  Left:  chat (you talk, the model calls tools)
 *  Right: live seat map + Confirm panel, driven by the uiState the backend returns.
 *
 * Conversation is stateless: we keep `history` (opaque Gemini contents) and send
 * it back each turn. Display messages are tracked separately for rendering.
 */
const SUGGESTIONS = [
  "Action movie tomorrow in Mumbai, cheapest option",
  "Top rated movie this weekend",
  "Hold 2 good seats together for tonight",
];

export default function AgentPage() {
  const navigate = useNavigate();
  const { isAuthed } = useAuth();
  const { city } = useCity();

  const [messages, setMessages] = useState([
    { role: "model", text: "Hi! I can find movies, compare prices and hold seats for you. What do you feel like watching? 🍿" },
  ]);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [ui, setUi] = useState({ currentShowId: null, booking: null });

  const scrollRef = useRef(null);

  useEffect(() => {
    if (!isAuthed) navigate("/login", { state: { from: "/agent" } });
  }, [isAuthed, navigate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text) {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setBusy(true);
    try {
      const res = await api.agentChat(msg, history, city);
      setHistory(res.history || []);
      setMessages((m) => [...m, { role: "model", text: res.reply, tools: res.toolTrace || [], cards: res.cards || [] }]);
      if (res.uiState) setUi((prev) => ({ ...prev, ...res.uiState }));
    } catch (err) {
      if (err.status === 401) { navigate("/login", { state: { from: "/agent" } }); return; }
      setMessages((m) => [...m, { role: "model", text: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <Nav variant="inner" title="Movie Assistant" onBack={() => navigate("/")} />

      <div className={`agent-split${ui.currentShowId ? " agent-split--seating" : ""}`}>
        {/* ── LEFT: chat ── */}
        <div className="agent-chat">
          <div className="chat-scroll" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={`bubble-row ${m.role}`}>
                <div className="bubble-col">
                  {m.tools && m.tools.length > 0 && (
                    <div className="tool-chips">
                      {m.tools.map((t, j) => (
                        <span key={j} className="tool-chip">{t}</span>
                      ))}
                    </div>
                  )}
                  <div className={`bubble ${m.role}`}>{m.text}</div>
                  {m.cards && m.cards.map((card, k) => (
                    <AgentCard key={k} card={card} onPick={send} />
                  ))}
                </div>
              </div>
            ))}
            {busy && (
              <div className="bubble-row model">
                <div className="bubble model typing"><span></span><span></span><span></span></div>
              </div>
            )}
          </div>

          {messages.length <= 1 && (
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="suggest-chip" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          )}

          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything about movies…"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send">➤</button>
          </form>
        </div>

        {/* ── RIGHT: context pane ── */}
        <div className="agent-pane">
          <RightPane ui={ui} navigate={navigate} setUi={setUi} onAskAgent={send} />
        </div>
      </div>
    </div>
  );
}

function RightPane({ ui, navigate, setUi, onAskAgent }) {
  if (!ui.currentShowId) {
    return (
      <div className="agent-pane-empty">
        <div className="icon">🎬</div>
        <div>Your seat map will appear here as we chat.</div>
      </div>
    );
  }
  return <SeatPane ui={ui} navigate={navigate} setUi={setUi} onAskAgent={onAskAgent} />;
}

function SeatPane({ ui, navigate, setUi, onAskAgent }) {
  const { seats, loading } = useSeatMap(ui.currentShowId);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const booking = ui.booking;
  const heldMode = Boolean(booking?.bookingId);
  const pricePerSeat = booking?.pricePerSeat ?? ui.pricePerSeat ?? null;
  const meta = booking
    ? { movie: booking.movie, theater: booking.theater, screen: booking.screen, startTime: booking.startTime }
    : ui.showMeta;

  // Sync selection when the agent suggests or holds seats
  useEffect(() => {
    if (heldMode && booking.showSeatIds?.length) {
      setSelectedIds(new Set(booking.showSeatIds));
    } else if (ui.suggestedSeatIds?.length) {
      setSelectedIds(new Set(ui.suggestedSeatIds));
    }
  }, [heldMode, booking?.showSeatIds, ui.suggestedSeatIds]);

  // Reset local selection when switching shows
  useEffect(() => {
    if (!heldMode && !ui.suggestedSeatIds?.length) {
      setSelectedIds(new Set());
    }
  }, [ui.currentShowId]);

  function toggleSeat(id) {
    if (heldMode) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 10) next.add(id);
      return next;
    });
  }

  function askHoldSelected() {
    const labels = seatLabels(seats, selectedIds);
    if (!labels) return;
    onAskAgent(`Please hold seats ${labels} for me`);
  }

  const count = selectedIds.size;
  const total = pricePerSeat != null ? pricePerSeat * count : null;
  const subBar = meta
    ? `${meta.movie} · ${meta.theater} · ${meta.screen}${pricePerSeat != null ? ` · ₹${pricePerSeat}/seat` : ""}`
    : null;

  async function confirm() {
    setBusy(true); setErr(null);
    try {
      await api.confirm(booking.bookingId);
      navigate(`/confirmed/${booking.bookingId}`, {
        state: {
          booking: { seats: booking.seats },
          movieTitle: booking.movie,
          theaterName: booking.theater,
          screenName: booking.screen,
          startTime: booking.startTime,
          total: pricePerSeat != null ? pricePerSeat * booking.seats.length : null,
        },
      });
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try { await api.cancel(booking.bookingId); } catch { /* idempotent */ }
    setUi((u) => ({ ...u, booking: null, suggestedSeatIds: null }));
    setSelectedIds(new Set());
    setBusy(false);
  }

  return (
    <div className="seat-pane-inner">
      {subBar && (
        <div className="sub-bar" style={{ borderRadius: booking ? "12px 12px 0 0" : undefined }}>
          {subBar}
        </div>
      )}

      <div className="seat-legend">
        <Legend color="var(--seat-available)" label="Available" />
        {!heldMode && <Legend color="var(--seat-selected)" label="Selected" />}
        <Legend color="var(--seat-held)" label="Held" />
        <Legend color="var(--seat-booked)" label="Booked" />
      </div>

      {!heldMode && (
        <p className="agent-seat-hint">
          Tap seats to pick your own, or ask the assistant to suggest and hold seats for you.
        </p>
      )}

      {loading ? (
        <div className="center-msg">Loading seat map…</div>
      ) : (
        <SeatGrid
          seats={seats}
          selectedIds={selectedIds}
          flashIds={new Set()}
          onToggle={toggleSeat}
          readOnly={heldMode}
        />
      )}

      {heldMode && booking && (
        <>
          <div className="booking-summary">
            <div className="summary-row">
              <span>Seats</span>
              <span>{booking.seats.map((s) => `${s.row}${s.number}`).join(", ")}</span>
            </div>
            {pricePerSeat != null && (
              <>
                <div className="summary-row"><span>Price per seat</span><span>₹{pricePerSeat}</span></div>
                <div className="summary-row summary-total">
                  <span>Total</span>
                  <span>₹{pricePerSeat * booking.seats.length}</span>
                </div>
              </>
            )}
          </div>
          {err && <div className="banner-error"><div className="t">Couldn’t confirm</div><div className="d">{err}</div></div>}
          <div className="btn-wrap">
            <button className="btn-primary" disabled={busy} onClick={confirm}>
              {busy ? "Processing…" : pricePerSeat != null ? `Confirm & Pay · ₹${pricePerSeat * booking.seats.length}` : "Confirm & Pay"}
            </button>
            <button className="btn-secondary" disabled={busy} onClick={cancel}>Release hold</button>
          </div>
        </>
      )}

      {!heldMode && count > 0 && (
        <>
          <div className="booking-summary">
            <div className="summary-row">
              <span>Selected</span>
              <span>{seatLabels(seats, selectedIds)}</span>
            </div>
            {pricePerSeat != null && (
              <>
                <div className="summary-row"><span>Price per seat</span><span>₹{pricePerSeat}</span></div>
                <div className="summary-row summary-total"><span>Total</span><span>₹{total}</span></div>
              </>
            )}
          </div>
          <div className="btn-wrap">
            <button className="btn-primary" disabled={busy} onClick={askHoldSelected}>
              Ask assistant to hold {count} seat{count > 1 ? "s" : ""}{total != null ? ` · ₹${total}` : ""}
            </button>
            <button className="btn-secondary" onClick={() => setSelectedIds(new Set())}>Clear selection</button>
          </div>
        </>
      )}
    </div>
  );
}

function seatLabels(seats, selectedIds) {
  return seats
    .filter((s) => selectedIds.has(s.id))
    .map((s) => `${s.seat.row}${s.seat.number}`)
    .sort()
    .join(", ");
}

function Legend({ color, label }) {
  return <div className="legend-item"><div className="legend-dot" style={{ background: color }} />{label}</div>;
}

/**
 * AgentCard — rich card rendered inside the chat, built from real tool data.
 *  - "movies": horizontal scroll of poster cards; click → ask for its showtimes
 *  - "showtimes": comparison table (cheapest first); click a row → book intent
 */
function AgentCard({ card, onPick }) {
  if (card.type === "movies") {
    return (
      <div className="agent-card movies-card">
        {card.items.map((m) => (
          <button key={m.movieId} className="mini-movie" onClick={() => onPick(`Show me showtimes for ${m.title} tomorrow`)}>
            {m.posterUrl
              ? <img src={m.posterUrl} alt={m.title} loading="lazy" />
              : <div className="mini-poster-fallback">🎬</div>}
            <div className="mini-title" title={m.title}>{m.title}</div>
            <div className="mini-meta">
              {m.rating != null && <span className="mini-rating">★ {m.rating.toFixed(1)}</span>}
              <span>{m.genre}</span>
            </div>
          </button>
        ))}
      </div>
    );
  }

  if (card.type === "showtimes") {
    const cheapest = card.items.length ? card.items[0].price : null;
    return (
      <div className="agent-card showtimes-card">
        <div className="st-head">
          <span>Theater</span><span>Time</span><span>Price</span><span>Seats</span>
        </div>
        {card.items.map((s) => (
          <button
            key={s.showId}
            className={`st-row ${s.price === cheapest ? "cheapest" : ""}`}
            onClick={() => onPick(`Book seats for ${s.movie || "that movie"} — the ${s.time} show at ${s.theater}`)}
          >
            <span className="st-theater">
              {s.theater}
              <small>{s.screen}</small>
            </span>
            <span>{s.time}</span>
            <span className="st-price">₹{s.price}{s.price === cheapest && <em> cheapest</em>}</span>
            <span style={{ color: s.availableSeats <= 10 ? "var(--avail-low)" : "var(--avail-ok)" }}>
              {s.availableSeats === 0 ? "Full" : s.availableSeats}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return null;
}
