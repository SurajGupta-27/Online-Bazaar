// Store identity for emails and invoices. Keep in step with client/src/brand.js.
export const BRAND = {
  name: "Online Bazaar",
  owner: "Suraj Gupta",
  tagline: "Everything you need, delivered to your door",
};

// ₹1,23,456 (Indian digit grouping; paise only when there are any).
export const formatRupees = (amount, { symbol = "₹" } = {}) => {
  const value = Number(amount) || 0;
  const formatted = value.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
};
