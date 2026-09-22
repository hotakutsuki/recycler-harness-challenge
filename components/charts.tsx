/**
 * The two charts on the report, as inline SVG.
 *
 * No chart library: two forms, drawn once, with no interaction a table below
 * does not already give. A dependency would cost more to carry than the ~60
 * lines it replaces.
 *
 * The forms are picked by what the reader has to do, not by what looks lively.
 * Ranking materials by money is a magnitude comparison, so it is bars on a
 * shared baseline — a pie of thirteen slices would be unreadable, and the two
 * biggest slices would be the only ones anyone could compare. Splitting each
 * day into what was handed over and what is still owed is part-to-whole, so it
 * is a stacked bar.
 *
 * Colours are the validated categorical pair (blue/orange, ΔE 24.7 under
 * protanopia) for the stack, and a single blue for the ranked bars, since those
 * carry magnitude rather than identity.
 */

const BLUE = "#2a78d6";
const ORANGE = "#eb6834";
const TRACK = "#eceff2";
const INK = "#1f2933";
const MUTED = "#5a6878";

interface Slice {
  label: string;
  value: number;
}

export function RankedBars({
  data,
  format,
  max = 8,
  otherLabel,
}: {
  data: Slice[];
  format: (n: number) => string;
  max?: number;
  otherLabel: string;
}) {
  // Past eight rows the ranking stops being readable and the tail stops
  // mattering; it folds into one row rather than growing more colours.
  const head = data.slice(0, max);
  const tail = data.slice(max);
  const rows = tail.length
    ? [...head, { label: otherLabel, value: tail.reduce((s, d) => s + d.value, 0) }]
    : head;

  const top = Math.max(...rows.map((r) => r.value), 1);
  const rowHeight = 30;
  const labelWidth = 132;
  const valueWidth = 92;
  const height = rows.length * rowHeight;

  return (
    <svg
      viewBox={`0 0 640 ${height}`}
      role="img"
      className="chart"
      preserveAspectRatio="xMinYMin meet"
    >
      {rows.map((row, i) => {
        const width = Math.max(2, ((640 - labelWidth - valueWidth) * row.value) / top);
        const y = i * rowHeight;
        return (
          <g key={row.label}>
            <title>{`${row.label}: ${format(row.value)}`}</title>
            <text x={0} y={y + 19} fontSize="13" fill={INK}>
              {row.label.length > 18 ? row.label.slice(0, 17) + "…" : row.label}
            </text>
            <rect x={labelWidth} y={y + 7} width={640 - labelWidth - valueWidth} height={14} rx={4} fill={TRACK} />
            <rect x={labelWidth} y={y + 7} width={width} height={14} rx={4} fill={BLUE} />
            <text x={640} y={y + 19} fontSize="13" fill={MUTED} textAnchor="end">
              {format(row.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function StackedDays({
  data,
  format,
  labels,
}: {
  data: { day: string; paid: number; owed: number }[];
  format: (n: number) => string;
  labels: { paid: string; owed: string };
}) {
  const top = Math.max(...data.map((d) => d.paid + d.owed), 1);
  const rowHeight = 34;
  const dayWidth = 104;
  const valueWidth = 96;
  const track = 640 - dayWidth - valueWidth;
  const height = data.length * rowHeight;

  return (
    <>
      <div className="legend">
        <span>
          <i style={{ background: BLUE }} /> {labels.paid}
        </span>
        <span>
          <i style={{ background: ORANGE }} /> {labels.owed}
        </span>
      </div>
      <svg viewBox={`0 0 640 ${height}`} role="img" className="chart" preserveAspectRatio="xMinYMin meet">
        {data.map((d, i) => {
          const total = d.paid + d.owed;
          const paidWidth = Math.max(0, (track * d.paid) / top);
          // A 2px gap between the two fills, so they read as two quantities
          // rather than one bar with a colour change.
          const owedWidth = Math.max(0, (track * d.owed) / top - (d.owed > 0 ? 2 : 0));
          const y = i * rowHeight;
          return (
            <g key={d.day}>
              <title>{`${d.day}: ${format(d.paid)} ${labels.paid}, ${format(d.owed)} ${labels.owed}`}</title>
              <text x={0} y={y + 21} fontSize="13" fill={INK}>
                {d.day}
              </text>
              <rect x={dayWidth} y={y + 9} width={track} height={14} rx={4} fill={TRACK} />
              <rect x={dayWidth} y={y + 9} width={Math.max(2, paidWidth)} height={14} rx={4} fill={BLUE} />
              {d.owed > 0 && (
                <rect
                  x={dayWidth + paidWidth + 2}
                  y={y + 9}
                  width={Math.max(2, owedWidth)}
                  height={14}
                  rx={4}
                  fill={ORANGE}
                />
              )}
              <text x={640} y={y + 21} fontSize="13" fill={MUTED} textAnchor="end">
                {format(total)}
              </text>
            </g>
          );
        })}
      </svg>
    </>
  );
}
