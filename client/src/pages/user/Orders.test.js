import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import Orders from "./Orders";
import { AuthProvider } from "../../context/auth";
import { SearchProvider } from "../../context/search";
import { CartProvider } from "../../context/cart";

jest.mock("axios", () => ({
  get: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const order = (id, extra) => ({
  _id: `0000000000000000000000${id}`,
  status: "placed",
  items: [{ name: "Phone", quantity: 1 }],
  total: 19599,
  createdAt: "2026-09-01T10:00:00Z",
  ...extra,
});

test("each order shows its payment method, status and total in rupees", async () => {
  axios.get.mockResolvedValue({
    data: {
      success: true,
      orders: [
        order("a1", { paymentMethod: "razorpay", paymentStatus: "paid", razorpayPaymentId: "pay_XYZ" }),
        order("b2", { paymentMethod: "cod", paymentStatus: "pending" }),
        order("c3", { paymentMethod: "razorpay", paymentStatus: "failed", status: "cancelled" }),
        order("d4", {}), // placed before payments existed
      ],
    },
  });
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter>
            <Orders />
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );
  expect(await screen.findByText("Paid")).toBeInTheDocument();
  expect(screen.getByText("ID: pay_XYZ")).toBeInTheDocument();
  expect(screen.getAllByText("Payment: Cash on Delivery")).toHaveLength(2);
  expect(screen.getAllByText("Payment pending")).toHaveLength(2);
  expect(screen.getByText("Payment failed")).toBeInTheDocument();
  expect(screen.getAllByText("₹19,599")).toHaveLength(4);
});

const renderOrders = (orders) => {
  axios.get.mockImplementation((url) =>
    url === "/api/v1/order/my-orders"
      ? Promise.resolve({ data: { success: true, orders } })
      : Promise.reject(new Error(`unexpected ${url}`))
  );
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter>
            <Orders />
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );
};

test("confirmed orders offer their invoice; unpaid online orders don't", async () => {
  renderOrders([
    order("a1", { paymentMethod: "razorpay", paymentStatus: "paid" }),
    order("b2", { paymentMethod: "cod", paymentStatus: "pending" }),
    order("c3", { paymentMethod: "razorpay", paymentStatus: "failed", status: "cancelled" }),
    order("d4", {}), // before payments existed: counts as Cash on Delivery
  ]);
  await screen.findAllByText("₹19,599");
  expect(screen.getAllByRole("button", { name: "Download invoice" })).toHaveLength(3);
  const failed = screen.getByText("Order 000000C3").closest("article");
  expect(within(failed).queryByRole("button", { name: "Download invoice" })).toBeNull();
});

test("download invoice saves the PDF the API returns", async () => {
  renderOrders([order("a1", { paymentMethod: "cod", paymentStatus: "pending" })]);
  const pdf = new Blob(["%PDF-1.3"], { type: "application/pdf" });
  URL.createObjectURL = jest.fn(() => "blob:invoice");
  URL.revokeObjectURL = jest.fn();
  const clicked = [];
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    clicked.push({ href: this.href, download: this.download });
  };
  axios.get.mockImplementation((url) =>
    url === "/api/v1/order/invoice/0000000000000000000000a1"
      ? Promise.resolve({ data: pdf, headers: { "content-disposition": 'attachment; filename="INV-2026-000007.pdf"' } })
      : Promise.resolve({ data: { success: true, orders: [order("a1", { paymentMethod: "cod" })] } })
  );
  fireEvent.click(await screen.findByRole("button", { name: "Download invoice" }));
  await waitFor(() => expect(clicked).toEqual([{ href: "blob:invoice", download: "INV-2026-000007.pdf" }]));
  expect(axios.get).toHaveBeenCalledWith("/api/v1/order/invoice/0000000000000000000000a1", { responseType: "blob" });
  expect(URL.createObjectURL).toHaveBeenCalledWith(pdf);
  HTMLAnchorElement.prototype.click = realClick;
});

test("a refused download shows the API's message", async () => {
  renderOrders([order("a1", { paymentMethod: "cod" })]);
  const button = await screen.findByRole("button", { name: "Download invoice" });
  axios.get.mockRejectedValue({
    response: { status: 409, data: new Blob([JSON.stringify({ message: "The invoice is available once the order is paid" })]) },
  });
  fireEvent.click(button);
  expect(await screen.findByText("The invoice is available once the order is paid")).toBeInTheDocument();
});
