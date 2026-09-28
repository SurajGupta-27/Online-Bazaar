// Prices are in rupees. Each range is [min, max): min is included, max is
// excluded, and a null max means no upper limit. Contiguous ranges leave no
// gaps (e.g. ₹999.50).
export const Prices = [
  {
    _id: 0,
    name: "Under ₹1,000",
    array: [0, 1000],
  },
  {
    _id: 1,
    name: "₹1,000 to ₹4,999",
    array: [1000, 5000],
  },
  {
    _id: 2,
    name: "₹5,000 to ₹19,999",
    array: [5000, 20000],
  },
  {
    _id: 3,
    name: "₹20,000 to ₹49,999",
    array: [20000, 50000],
  },
  {
    _id: 4,
    name: "₹50,000 to ₹99,999",
    array: [50000, 100000],
  },
  {
    _id: 5,
    name: "₹1,00,000 or more",
    array: [100000, null],
  },
];
