// Each range is [min, max): min is included, max is excluded, and a null max
// means no upper limit. Contiguous ranges leave no gaps (e.g. $19.50).
export const Prices = [
  {
    _id: 0,
    name: "Under $20",
    array: [0, 20],
  },
  {
    _id: 1,
    name: "$20 to $39.99",
    array: [20, 40],
  },
  {
    _id: 2,
    name: "$40 to $59.99",
    array: [40, 60],
  },
  {
    _id: 3,
    name: "$60 to $79.99",
    array: [60, 80],
  },
  {
    _id: 4,
    name: "$80 to $99.99",
    array: [80, 100],
  },
  {
    _id: 5,
    name: "$100 or more",
    array: [100, null],
  },
];
