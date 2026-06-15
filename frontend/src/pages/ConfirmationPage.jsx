import { useParams, useNavigate, useLocation } from "react-router-dom";
import Nav from "../components/Nav";

/**
 * ConfirmationPage — shown after a successful POST /bookings/:id/confirm.
 * Reads the booking details from router state (passed by the seat picker).
 */
export default function ConfirmationPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();

  const booking = state?.booking;
  const seats = booking?.seats?.map((s) => `${s.row}${s.number}`).join(", ");

  return (
    <div className="app-shell">
      <div className="nav"><span className="nav-logo" onClick={() => navigate("/")}>BookMyShow</span></div>
      <div className="confirm-screen">
        <div className="confirm-icon">✓</div>
        <div className="confirm-title">Booking confirmed!</div>
        <div className="confirm-sub">Your tickets are booked. See you at the movies.</div>

        <div className="ticket">
          <Row k="Booking ID" v={`#BMS-${bookingId}`} />
          {state?.movieTitle && <Row k="Movie" v={state.movieTitle} />}
          {state?.theaterName && <Row k="Theater" v={`${state.theaterName}${state.city ? `, ${state.city}` : ""}`} />}
          {state?.screenName && <Row k="Screen" v={state.screenName} />}
          {state?.startTime && <Row k="Date & time" v={formatDateTime(state.startTime)} />}
          {seats && <Row k="Seats" v={seats} />}
          {state?.total != null && (
            <div className="ticket-row" style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <span className="k" style={{ fontWeight: 600 }}>Total paid</span>
              <span className="v" style={{ fontSize: 15, color: "var(--avail-ok)" }}>₹{state.total}</span>
            </div>
          )}
        </div>

        <button className="btn-primary" onClick={() => navigate("/")}>Back to home</button>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return <div className="ticket-row"><span className="k">{k}</span><span className="v">{v}</span></div>;
}
function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-US", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
