import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import axios from "axios";
import OrderDetails from "./OrderDetails";
import { AuthProvider } from "../../context/auth";
import { SearchProvider } from "../../context/search";
import { CartProvider } from "../../context/cart";

jest.mock("axios", () => ({
  get: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const ID = "0000000000000000abcdef12";
const order = (extra) => ({
  _id: ID,
  status: "shipped",
  items: [
    {
      name: "Phone X",
      price: 19599,
      quantity: 1,
      product: { _id: "p1", slug: "phone-x", images: [{ url: "https://res.cloudinary.com/demo/image/upload/phone.jpg" }] },
    },
    { name: "Gone product", price: 50, quantity: 2, product: null },
  ],
  total: 19699,
  shippingAddress: "12 MG Road, Pune",
  paymentMethod: "cod",
  paymentStatus: "pending",
  createdAt: "2026-10-01T04:30:00Z",
  statusHistory: [
    { status: "placed", at: "2026-10-01T04:30:00Z" },
    { status: "packed", at: "2026-10-02T06:00:00Z", note: "Packed at Pune warehouse" },
    { status: "shipped", at: "2026-10-03T09:15:00Z", note: "BlueDart, AWB 1234567890" },
  ],
  estimatedDelivery: "2026-10-05T09:15:00Z",
  ...extra,
});

const renderPage = (response) => {
  axios.get.mockImplementation((url) =>
    url === `/api/v1/order/my-orders/${ID}` ? response() : Promise.reject(new Error(`unexpected ${url}`))
  );
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter initialEntries={[`/dashboard/user/orders/${ID}`]}>
            <Routes>
              <Route path="/dashboard/user/orders/:id" element={<OrderDetails />} />
            </Routes>
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );
};
const ok = (o) => () => Promise.resolve({ data: { success: true, order: o } });
const steps = async () =>
  within(await screen.findByRole("list", { name: "Order tracking" })).getAllByRole("listitem");

test("shows each step with its time and note, the current one highlighted", async () => {
  renderPage(ok(order()));
  const rows = await steps();
  expect(rows.map((r) => r.querySelector(".order-timeline-label").textContent)).toEqual([
    "Order placed", "Packed", "Shipped", "Out for delivery", "Delivered",
  ]);
  expect(rows.map((r) => r.className.replace("order-timeline-step ", ""))).toEqual([
    "is-done", "is-done", "is-current", "is-upcoming", "is-upcoming",
  ]);
  expect(rows[2]).toHaveAttribute("aria-current", "step");
  expect(within(rows[0]).getByText(/1 Oct 2026/)).toBeInTheDocument();
  expect(within(rows[1]).getByText("Packed at Pune warehouse")).toBeInTheDocument();
  expect(within(rows[2]).getByText("BlueDart, AWB 1234567890")).toBeInTheDocument();
  expect(rows[3].querySelector("time")).toBeNull();
  expect(screen.getByText(/^Arriving by .*5 Oct/)).toBeInTheDocument();
});

test("lists the items, address, payment and total", async () => {
  renderPage(ok(order()));
  expect(await screen.findByRole("link", { name: "Phone X" })).toHaveAttribute("href", "/product/phone-x");
  expect(screen.getByText("Gone product")).toBeInTheDocument();
  expect(screen.getByText("₹19,699")).toBeInTheDocument();
  expect(screen.getByText("12 MG Road, Pune")).toBeInTheDocument();
  expect(screen.getByText("Payment: Cash on Delivery")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Download invoice" })).toBeInTheDocument();
});

test("a cancelled order shows the steps it reached, then Cancelled", async () => {
  renderPage(
    ok(
      order({
        status: "cancelled",
        estimatedDelivery: null,
        statusHistory: [
          { status: "placed", at: "2026-10-01T04:30:00Z" },
          { status: "packed", at: "2026-10-02T06:00:00Z" },
          { status: "cancelled", at: "2026-10-02T08:00:00Z", note: "Out of stock" },
        ],
      })
    )
  );
  const rows = await steps();
  expect(rows.map((r) => r.querySelector(".order-timeline-label").textContent)).toEqual([
    "Order placed", "Packed", "Cancelled",
  ]);
  expect(rows[2]).toHaveClass("is-cancelled");
  expect(within(rows[2]).getByText("Out of stock")).toBeInTheDocument();
  expect(screen.getByText("This order was cancelled.")).toBeInTheDocument();
  expect(screen.queryByText(/Arriving by/)).not.toBeInTheDocument();
});

test("a delivered order says when it arrived", async () => {
  renderPage(
    ok(
      order({
        status: "delivered",
        estimatedDelivery: null,
        statusHistory: [
          ...order().statusHistory,
          { status: "out_for_delivery", at: "2026-10-04T03:00:00Z" },
          { status: "delivered", at: "2026-10-04T10:00:00Z" },
        ],
      })
    )
  );
  const rows = await steps();
  expect(rows[4]).toHaveClass("is-current");
  expect(screen.getByText(/^Delivered on .*4 Oct/)).toBeInTheDocument();
});

test("an older order without history still shows where it is", async () => {
  renderPage(ok(order({ status: "processing", statusHistory: undefined })));
  const rows = await steps();
  expect(rows[0]).toHaveClass("is-current");
  expect(within(rows[0]).getByText(/1 Oct 2026/)).toBeInTheDocument();
});

test("someone else's order (404) shows not found", async () => {
  renderPage(() => Promise.reject({ response: { status: 404, data: { message: "Order not found" } } }));
  expect(await screen.findByRole("heading", { name: "Order not found" })).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Order tracking" })).not.toBeInTheDocument();
});
