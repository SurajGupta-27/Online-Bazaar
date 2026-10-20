import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import Analytics from "./Analytics";
import { AuthProvider } from "../../context/auth";
import { SearchProvider } from "../../context/search";
import { CartProvider } from "../../context/cart";
import { compactRupees, niceTicks, shortDate } from "../../components/Charts/chartFormat";

jest.mock("axios", () => ({
  get: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const days = Array.from({ length: 30 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 8, 21 + i)).toISOString().slice(0, 10);
  return { date, revenue: i === 29 ? 200 : 0, unpaidCod: i === 29 ? 150 : 0, orders: i === 29 ? 2 : 0 };
});
const dashboard = {
  success: true,
  generatedAt: "2026-10-20T08:00:00Z",
  timeZone: "Asia/Kolkata",
  summary: {
    revenue: 125000, paidOrders: 40, unpaidCod: 8400, unpaidCodOrders: 3, orders: 43, cancelledOrders: 5,
    customers: 120, customersWithOrders: 31, averageOrderValue: 3102.33,
  },
  daily: days,
  topProducts: [
    { _id: "p1", name: "Phone X", slug: "phone-x", units: 12, sales: 235188 },
    { _id: "p2", name: "Old Gadget", slug: null, units: 4, sales: 80 },
  ],
  salesByCategory: Array.from({ length: 10 }, (_, i) => ({ _id: `c${i}`, name: `Category ${i}`, units: 10 - i, sales: 1000 - i * 50 })),
  paymentSplit: [
    { method: "cod", orders: 30, value: 60000 },
    { method: "razorpay", orders: 10, value: 73400 },
  ],
  statusBreakdown: [
    { status: "placed", orders: 4 }, { status: "processing", orders: 2 }, { status: "shipped", orders: 6 },
    { status: "delivered", orders: 31 }, { status: "cancelled", orders: 5 },
  ],
  lowStock: {
    limit: 5,
    total: 2,
    products: [
      { _id: "s1", name: "Pen", slug: "pen", quantity: 0, price: 10, category: "Books" },
      { _id: "s2", name: "Phone X", slug: "phone-x", quantity: 3, price: 19599, category: null },
    ],
  },
};

const renderPage = () =>
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter>
            <Analytics />
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );

const card = (title) => screen.getByRole("region", { name: title });

test("headline numbers, with unpaid COD shown apart from revenue", async () => {
  axios.get.mockResolvedValue({ data: dashboard });
  renderPage();
  expect(await screen.findByText("₹1,25,000")).toBeInTheDocument();
  expect(screen.getByText("+ ₹8,400 awaiting cash on delivery (3 orders)")).toBeInTheDocument();
  expect(screen.getByText("43")).toBeInTheDocument();
  expect(screen.getByText("5 cancelled, not counted")).toBeInTheDocument();
  expect(screen.getByText("120")).toBeInTheDocument();
  expect(screen.getByText("31 have ordered")).toBeInTheDocument();
  expect(screen.getByText("₹3,102.33")).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith("/api/v1/analytics/dashboard");
});

test("revenue chart: legend, a readout on focus, and a table view", async () => {
  axios.get.mockResolvedValue({ data: dashboard });
  renderPage();
  const revenue = await screen.findByRole("region", { name: "Revenue, last 30 days" });
  const legend = within(revenue).getByRole("list");
  expect(within(legend).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Paid", "Awaiting cash (COD)"]);
  const today = within(revenue).getByRole("img", { name: "20 Oct: Paid ₹200, Awaiting cash (COD) ₹150" });
  fireEvent.focus(today);
  const readout = within(revenue).getByRole("status");
  expect(readout).toHaveTextContent("20 Oct");
  expect(readout).toHaveTextContent("₹200Paid");
  expect(readout).toHaveTextContent("₹150Awaiting cash (COD)");
  // The table holds every value without hovering.
  const rows = within(revenue).getAllByRole("row");
  expect(rows).toHaveLength(31);
  expect(rows[30]).toHaveTextContent("20 Oct₹200₹1502");
  // The orders chart has one series, so no legend.
  const orders = card("Orders, last 30 days");
  expect(within(orders).queryByRole("list")).toBeNull();
});

test("top products, categories (folded into Other), payment split and statuses", async () => {
  axios.get.mockResolvedValue({ data: dashboard });
  renderPage();
  const top = await screen.findByRole("region", { name: "Top 5 products" });
  expect(within(top).getByRole("link", { name: "Phone X" })).toHaveAttribute("href", "/product/phone-x");
  expect(within(top).getByText("12 units")).toBeInTheDocument();
  // A deleted product keeps its name but has no link.
  expect(within(top).getByRole("listitem", { name: "Old Gadget: 4 units, ₹80" })).toBeInTheDocument();
  expect(within(top).queryByRole("link", { name: "Old Gadget" })).toBeNull();

  const categories = card("Sales by category");
  const bars = within(categories).getAllByRole("listitem");
  expect(bars).toHaveLength(8);
  expect(bars[7]).toHaveTextContent("Other (3)");
  expect(bars[7]).toHaveTextContent("Other (3)6 units₹1,800"); // categories 7-9: 650 + 600 + 550
  expect(within(categories).getAllByRole("row")).toHaveLength(11); // the table keeps all 10

  const split = card("Cash on Delivery vs online");
  expect(within(split).getByRole("img", { name: "Cash on Delivery 75%, Online 25%" })).toBeInTheDocument();
  const legendItems = within(split).getAllByRole("listitem").map((li) => li.textContent);
  expect(legendItems).toEqual(["Cash on Delivery 75%30 orders · ₹60,000", "Online 25%10 orders · ₹73,400"]);

  const status = card("Order status");
  expect(within(status).getByRole("listitem", { name: "Delivered: 31" })).toBeInTheDocument();
});

test("low stock lists products with 5 or fewer, labelled, with a restock link", async () => {
  axios.get.mockResolvedValue({ data: dashboard });
  renderPage();
  const low = await screen.findByRole("region", { name: "Low stock" });
  expect(within(low).getByText("2 products with 5 or fewer left")).toBeInTheDocument();
  const pen = within(low).getByText("Pen").closest("tr");
  expect(within(pen).getByText("Out of stock")).toBeInTheDocument();
  expect(within(pen).getByRole("link", { name: "Restock" })).toHaveAttribute("href", "/dashboard/admin/product/pen");
  expect(within(within(low).getByText("Phone X").closest("tr")).getByText("3 left")).toBeInTheDocument();
});

test("an error is shown, and Refresh tries again", async () => {
  axios.get.mockRejectedValueOnce({ response: { status: 500, data: { message: "Unable to load analytics" } } });
  renderPage();
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load analytics");
  axios.get.mockResolvedValue({ data: dashboard });
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByText("₹1,25,000")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});

test("chart helpers: Indian compact rupees, clean ticks, short dates", () => {
  expect([950, 1200, 340000, 11000000].map(compactRupees)).toEqual(["₹950", "₹1.2K", "₹3.4L", "₹1.1Cr"]);
  expect(niceTicks(0)).toEqual([0, 1]);
  expect(niceTicks(350)).toEqual([0, 100, 200, 300, 400]);
  expect(niceTicks(9)).toEqual([0, 2.5, 5, 7.5, 10]);
  expect(shortDate("2026-10-20")).toBe("20 Oct");
});
