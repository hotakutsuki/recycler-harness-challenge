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
const GREEN = "#1baf7a";
const VIOLET = "#4a3aa7";

/**
 * Four categorical slots, in fixed order, for the share charts.
 *
 * Not picked by eye: the skill's validator rejected the default fourth slot
 * (yellow sat 13.7 from orange under normal vision, below the floor of 15).
 * Violet in its place clears every check, the worst normal-vision pair being
 * 16.3 and the worst colour-vision-deficient pair 9.2. Green is under 3:1
 * against the surface, which is why every slice is directly labelled and the
 * table below carries the same numbers.
 */
const SHARE_COLORS = [BLUE, ORANGE, GREEN, VIOLET];
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

/**
 * A share of a whole, as a donut.
 *
 * Only works because it is capped at four slices: three named plus the rest.
 * Past that, slices stop being comparable and the chart becomes decoration —
 * the ranked bars above are the form for comparing thirteen materials. Every
 * slice is labelled with its share, since colour alone is never identity.
 */
export function ShareDonut({
  data,
  title,
  format,
  otherLabel,
  emptyLabel,
}: {
  data: Slice[];
  title: string;
  format: (n: number) => string;
  otherLabel: string;
  emptyLabel: string;
}) {
  const ranked = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const head = ranked.slice(0, 3);
  const tail = ranked.slice(3);
  const slices = tail.length
    ? [...head, { label: otherLabel, value: tail.reduce((s, d) => s + d.value, 0) }]
    : head;

  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return <p className="hint">{emptyLabel}</p>;

  const radius = 78;
  const inner = 46;
  const cx = 90;
  const cy = 90;
  // A 2px gap between slices, so two adjacent fills read as two quantities.
  const gap = 0.02;

  let angle = -Math.PI / 2;
  const arcs = slices.map((slice, i) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    const start = angle + (slices.length > 1 ? gap / 2 : 0);
    const end = angle + sweep - (slices.length > 1 ? gap / 2 : 0);
    angle += sweep;

    const point = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
    const large = sweep > Math.PI ? 1 : 0;
    const d = [
      `M ${point(radius, start)}`,
      `A ${radius} ${radius} 0 ${large} 1 ${point(radius, end)}`,
      `L ${point(inner, end)}`,
      `A ${inner} ${inner} 0 ${large} 0 ${point(inner, start)}`,
      "Z",
    ].join(" ");

    return { ...slice, d, color: SHARE_COLORS[i] ?? VIOLET, share: slice.value / total };
  });

  const percent = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <figure className="donut">
      <figcaption>{title}</figcaption>
      <div className="donut-body">
        <svg viewBox="0 0 180 180" role="img" width="180" height="180">
          {arcs.map((arc) => (
            <path key={arc.label} d={arc.d} fill={arc.color}>
              <title>{`${arc.label}: ${format(arc.value)} (${percent(arc.share)})`}</title>
            </path>
          ))}
        </svg>
        <ul>
          {arcs.map((arc) => (
            <li key={arc.label}>
              <i style={{ background: arc.color }} />
              <span className="name">{arc.label}</span>
              <span className="share">{percent(arc.share)}</span>
              <span className="value">{format(arc.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
