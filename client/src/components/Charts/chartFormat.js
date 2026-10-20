// Number helpers shared by the charts.

// Compact rupees for axis ticks, Indian style: ₹950, ₹1.2K, ₹3.4L, ₹1.1Cr.
export const compactRupees = (value) => {
  const n = Number(value) || 0;
  const trim = (x) => String(Math.round(x * 10) / 10);
  if (n >= 1e7) return `₹${trim(n / 1e7)}Cr`;
  if (n >= 1e5) return `₹${trim(n / 1e5)}L`;
  if (n >= 1e3) return `₹${trim(n / 1e3)}K`;
  return `₹${trim(n)}`;
};

export const compactNumber = (value) => {
  const n = Number(value) || 0;
  return n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(n);
};

// Clean axis ticks from 0 to at least `max`: steps of 1, 2, 2.5 or 5 x 10^k,
// about `count` of them. Always at least [0, 1].
export const niceTicks = (max, count = 4) => {
  if (!(max > 0)) return [0, 1];
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough);
  const ticks = [];
  for (let t = 0; t < max + step; t += step) ticks.push(Math.round(t * 1000) / 1000);
  return ticks;
};

// "2026-10-20" -> "20 Oct"
export const shortDate = (isoDay) =>
  new Date(`${isoDay}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

// Series colours: categorical slots 1 and 2, validated (colour-blind safe,
// >= 3:1 on white) with the dataviz palette checker. Add slots in this order.
export const CHART_COLORS = ["#2a78d6", "#eb6834"];
