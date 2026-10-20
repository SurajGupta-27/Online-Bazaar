import React, { useEffect, useRef, useState } from "react";
import { CHART_COLORS, niceTicks, percent } from "./chartFormat";

// Small, dependency-free charts for the admin analytics page. Marks follow one
// spec: bars at most 24px thick with a 4px rounded data end and a square
// baseline, a 2px surface gap between touching fills, hairline solid grid.
// Text always uses text colours; only marks and legend keys carry the series
// colour. Every chart has a hover/focus readout and a table view.

// Width of an element, kept up to date (the SVG chart is drawn in pixels so
// its text stays readable at any size).
const useWidth = (fallback = 600) => {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setWidth(el.clientWidth || fallback);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fallback]);
  return [ref, width];
};

// A card with a title, an optional subtitle, the chart, and its table view.
export const ChartCard = ({ title, subtitle, table, children, className = "" }) => (
  <section className={`chart-card ${className}`} aria-label={title}>
    <header>
      <h2 className="chart-title">{title}</h2>
      {subtitle && <p className="chart-subtitle">{subtitle}</p>}
    </header>
    {children}
    {table && (
      <details className="chart-table">
        <summary>Show table</summary>
        <div className="table-responsive">
          <table className="table table-sm">
            <thead>
              <tr>
                {table.columns.map((column, i) => (
                  <th key={column} scope="col" className={i ? "text-end" : ""}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (i ? <td key={i} className="text-end num">{cell}</td> : <th key={i} scope="row">{cell}</th>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    )}
  </section>
);

// A headline number: label, value, and an optional line of context.
export const StatTile = ({ label, value, detail }) => (
  <div className="stat-tile">
    <span className="stat-label">{label}</span>
    <span className="stat-value">{value}</span>
    {detail && <span className="stat-detail">{detail}</span>}
  </div>
);

// Legend for two or more series: a swatch shaped like the mark beside each name.
export const Legend = ({ series }) => (
  <ul className="chart-legend">
    {series.map((s) => (
      <li key={s.key}>
        <span className="legend-swatch" style={{ background: s.color }} aria-hidden="true" />
        {s.label}
      </li>
    ))}
  </ul>
);

// Rounded top on a column (the data end), square at the baseline.
const topRoundedRect = (x, y, w, h, r) => {
  const radius = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + radius}Q${x},${y} ${x + radius},${y}H${x + w - radius}Q${x + w},${y} ${x + w},${y + radius}V${y + h}Z`;
};

// Stacked (or single-series) columns over time. `data` is
// [{ key, label, values: { [seriesKey]: number } }]; `series` is
// [{ key, label, color }] drawn bottom-up.
export const ColumnChart = ({ data, series, format, tickFormat = format, labelEvery = 7, height = 200, label }) => {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(null);
  const margin = { top: 8, right: 8, bottom: 26, left: 52 };
  const plotW = Math.max(100, width - margin.left - margin.right);
  const band = plotW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(24, band - 4));
  const totals = data.map((d) => series.reduce((sum, s) => sum + (d.values[s.key] || 0), 0));
  const ticks = niceTicks(Math.max(...totals, 0));
  const top = ticks[ticks.length - 1];
  const y = (v) => margin.top + height - (v / top) * height;
  const activeIndex = active ?? null;

  return (
    <div className="column-chart" ref={ref}>
      {series.length > 1 && <Legend series={series} />}
      <div className="chart-plot" onMouseLeave={() => setActive(null)}>
        <svg width={width} height={height + margin.top + margin.bottom} role="group" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={margin.left} x2={width - margin.right} y1={y(t)} y2={y(t)} className={t === 0 ? "chart-baseline" : "chart-gridline"} />
              <text x={margin.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="chart-tick">
                {tickFormat(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = margin.left + i * band + (band - barW) / 2;
            let base = y(0);
            const dim = activeIndex !== null && activeIndex !== i;
            const marks = series.map((s, si) => {
              const value = d.values[s.key] || 0;
              if (!value) return null;
              const h = Math.max(1, (value / top) * height);
              const gap = si > 0 && base < y(0) ? 2 : 0; // surface gap between stacked segments
              const yTop = base - h;
              const isTop = series.slice(si + 1).every((next) => !(d.values[next.key] > 0));
              const segment = isTop ? (
                <path key={s.key} d={topRoundedRect(x, yTop, barW, h - gap, 4)} fill={s.color} />
              ) : (
                <rect key={s.key} x={x} y={yTop} width={barW} height={Math.max(0, h - gap)} fill={s.color} />
              );
              base = yTop;
              return segment;
            });
            return (
              <g key={d.key} opacity={dim ? 0.45 : 1}>
                {marks}
                {i % labelEvery === (data.length - 1) % labelEvery && (
                  <text x={x + barW / 2} y={y(0) + 18} textAnchor="middle" className="chart-tick">
                    {d.label}
                  </text>
                )}
                <rect
                  x={margin.left + i * band}
                  y={margin.top}
                  width={band}
                  height={height}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${d.label}: ${series.map((s) => `${s.label} ${format(d.values[s.key] || 0)}`).join(", ")}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="chart-hit"
                />
              </g>
            );
          })}
        </svg>
        {activeIndex !== null && data[activeIndex] && (
          <div
            className="chart-tooltip"
            role="status"
            style={{
              left: Math.min(Math.max(margin.left + activeIndex * band + band / 2, 80), width - 80),
            }}
          >
            <strong>{data[activeIndex].label}</strong>
            {series.map((s) => (
              <span key={s.key} className="tooltip-row">
                <span className="tooltip-key" style={{ background: s.color }} aria-hidden="true" />
                <span className="tooltip-value">{format(data[activeIndex].values[s.key] || 0)}</span>
                <span className="tooltip-name">{s.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Horizontal bars, one series, value at the tip. `rows` is
// [{ key, label, value, detail }]; `href(row)` optionally links the label.
export const BarList = ({ rows, format, color = CHART_COLORS[0], empty = "Nothing yet", renderLabel }) => {
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (!rows.length || max === 0) return <p className="chart-empty">{empty}</p>;
  return (
    <ul className="bar-list">
      {rows.map((row) => (
        <li key={row.key} tabIndex={0} aria-label={`${row.label}: ${format(row.value)}${row.detail ? `, ${row.detail}` : ""}`}>
          <span className="bar-label">
            {renderLabel ? renderLabel(row) : row.label}
            {row.detail && <small>{row.detail}</small>}
          </span>
          <span className="bar-track" aria-hidden="true">
            <span className="bar-fill" style={{ width: `${(row.value / max) * 100}%`, background: color }} />
            <span className="bar-value">{format(row.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
};

// Part-to-whole of two or three parts as one stacked bar with a legend that
// carries every number. `parts` is [{ key, label, value, detail, color }].
export const SplitBar = ({ parts, format }) => {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  if (!total) return <p className="chart-empty">No orders yet</p>;
  return (
    <div className="split-bar">
      <div className="split-track" role="img" aria-label={parts.map((p) => `${p.label} ${percent(p.value, total)}%`).join(", ")}>
        {parts.filter((p) => p.value > 0).map((p) => (
          <span key={p.key} style={{ flexGrow: p.value, background: p.color }} title={`${p.label}: ${format(p.value)}`} />
        ))}
      </div>
      <ul className="chart-legend split-legend">
        {parts.map((p) => (
          <li key={p.key}>
            <span className="legend-swatch" style={{ background: p.color }} aria-hidden="true" />
            <span>
              <strong>{p.label}</strong> {percent(p.value, total)}%
              <small className="d-block">
                {format(p.value)}
                {p.detail ? ` · ${p.detail}` : ""}
              </small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
