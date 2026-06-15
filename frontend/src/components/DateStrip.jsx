/**
 * DateStrip — a row of the next 7 days. The selected date drives the
 * GET /shows?movieId=&date= query (design doc 3.2a: date is a filter,
 * not a stored column).
 *
 * Emits dates as "YYYY-MM-DD" (UTC-based, matching the seed/backend).
 */
export default function DateStrip({ selected, onSelect }) {
  const days = buildUpcomingDays(7);

  return (
    <div className="date-strip">
      {days.map((d) => (
        <div
          key={d.iso}
          className={`date-chip ${selected === d.iso ? "active" : ""}`}
          onClick={() => onSelect(d.iso)}
        >
          <div className="num">{d.dayNum}</div>
          <div className="dow">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

export function todayIso() {
  return buildUpcomingDays(1)[0].iso;
}

function buildUpcomingDays(n) {
  const out = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD
    out.push({
      iso,
      dayNum: d.getDate(),
      label: i === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" }),
    });
  }
  return out;
}
