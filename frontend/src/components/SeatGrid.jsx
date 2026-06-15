/**
 * SeatGrid — renders the seat map as a grid of rows (A–E) × seats (1–10).
 *
 * Seat color is derived from the backend status + local selection:
 *   AVAILABLE + selected locally → blue  (selected)
 *   AVAILABLE                    → green (available, clickable)
 *   HELD                         → orange (held by someone — not clickable)
 *   BOOKED                       → gray (booked — not clickable)
 *   flashing                     → red (just-taken, from a 409 response)
 *
 * Props:
 *   seats        — [{ id, status, seat: { row, number } }]
 *   selectedIds  — Set of selected ShowSeat ids (local optimistic state)
 *   flashIds     — Set of ShowSeat ids to flash red (conflict feedback)
 *   onToggle     — (showSeatId) => void
 *   readOnly     — when true, seats are not clickable
 */
export default function SeatGrid({ seats, selectedIds, flashIds = new Set(), onToggle, readOnly = false }) {
  const rows = {};
  for (const ss of seats) {
    const r = ss.seat.row;
    (rows[r] ||= []).push(ss);
  }
  const rowKeys = Object.keys(rows).sort();
  const colNumbers = rowKeys.length
    ? rows[rowKeys[0]].sort((a, b) => a.seat.number - b.seat.number).map((s) => s.seat.number)
    : [];

  return (
    <div className="seat-container">
      <div className="screen-edge">— SCREEN THIS WAY —</div>
      <div className="seat-grid">
        <div className="row-label col-corner" aria-hidden="true" />
        {colNumbers.map((n) => (
          <div key={`col-${n}`} className="col-label">{n}</div>
        ))}
        {rowKeys.map((row) => {
          const rowSeats = rows[row].sort((a, b) => a.seat.number - b.seat.number);
          return (
            <RowFragment key={row} row={row}>
              {rowSeats.map((ss) => {
                const isSelected = selectedIds.has(ss.id);
                const isFlash = flashIds.has(ss.id);
                const cls = classFor(ss.status, isSelected, isFlash);
                const clickable = !readOnly && (ss.status === "AVAILABLE" || isSelected);
                return (
                  <button
                    key={ss.id}
                    className={`seat ${cls}`}
                    title={`${ss.seat.row}${ss.seat.number} · ${ss.status}`}
                    onClick={() => clickable && onToggle(ss.id)}
                    disabled={!clickable && !isFlash}
                  />
                );
              })}
            </RowFragment>
          );
        })}
      </div>
    </div>
  );
}

function RowFragment({ row, children }) {
  return (
    <>
      <div className="row-label">{row}</div>
      {children}
    </>
  );
}

function classFor(status, isSelected, isFlash) {
  if (isFlash) return "flash";
  if (isSelected) return "selected";
  if (status === "HELD") return "held";
  if (status === "BOOKED") return "booked";
  return "available";
}
