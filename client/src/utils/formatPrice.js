// Prices are stored in rupees. Indian digit grouping (₹1,29,990); paise are
// shown only when present (₹2.50).
export const formatPrice = (value) => {
  const amount = Number(value) || 0;
  const hasPaise = !Number.isInteger(amount);
  return amount.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  });
};
