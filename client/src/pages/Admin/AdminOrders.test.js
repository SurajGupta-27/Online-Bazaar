import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import AdminOrders from "./AdminOrders";
import { AuthProvider } from "../../context/auth";
import { SearchProvider } from "../../context/search";
import { CartProvider } from "../../context/cart";

jest.mock("axios", () => ({
  get: jest.fn(),
  put: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const order = (status, extra = {}) => ({
  _id: "0000000000000000abcdef12",
  status,
  user: { name: "Sam", email: "sam@x.com" },
  items: [{ name: "Pen", quantity: 3 }],
  total: 6,
  shippingAddress: "1 Road",
  createdAt: "2026-09-01T10:00:00Z",
  paymentMethod: "cod",
  paymentStatus: "pending",
  ...extra,
});

const renderPage = (status = "placed", extra) => {
  axios.get.mockResolvedValue({ data: { success: true, orders: [order(status, extra)] } });
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter>
            <AdminOrders />
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );
};

beforeEach(() => {
  axios.put.mockImplementation((url, body) =>
    Promise.resolve({
      data: {
        success: true,
        order: order(body.status, { statusHistory: [{ status: body.status, at: "2026-09-02T10:00:00Z", note: body.note }] }),
      },
    })
  );
});
afterEach(() => jest.restoreAllMocks());

test("lists orders with buyer, items, address and total", async () => {
  renderPage();
  expect(await screen.findByText("Order ABCDEF12")).toBeInTheDocument();
  expect(screen.getByText("Sam (sam@x.com)")).toBeInTheDocument();
  expect(screen.getByText("Pen x3")).toBeInTheDocument();
  expect(screen.getByText("Ship to: 1 Road")).toBeInTheDocument();
  expect(screen.getByText("₹6")).toBeInTheDocument();
});

test("offers only the next step, and saves it", async () => {
  renderPage("packed");
  fireEvent.click(await screen.findByRole("button", { name: "Mark as Shipped" }));
  await waitFor(() =>
    expect(axios.put).toHaveBeenCalledWith(
      "/api/v1/order/order-status/0000000000000000abcdef12",
      { status: "shipped" }
    )
  );
  expect(await screen.findByRole("button", { name: "Mark as Out for delivery" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Mark as Delivered" })).not.toBeInTheDocument();
});

test("sends the tracking note with the step and clears it", async () => {
  renderPage("packed");
  const note = await screen.findByLabelText("Tracking note for order ABCDEF12 (optional)");
  fireEvent.change(note, { target: { value: "  BlueDart, AWB 123 " } });
  fireEvent.click(screen.getByRole("button", { name: "Mark as Shipped" }));
  await waitFor(() =>
    expect(axios.put).toHaveBeenCalledWith(
      "/api/v1/order/order-status/0000000000000000abcdef12",
      { status: "shipped", note: "BlueDart, AWB 123" }
    )
  );
  await waitFor(() => expect(screen.getByLabelText("Tracking note for order ABCDEF12 (optional)")).toHaveValue(""));
  expect(screen.getAllByText("BlueDart, AWB 123").length).toBeGreaterThan(0);
});

test("a note can be added to the current step", async () => {
  renderPage("shipped");
  const add = await screen.findByRole("button", { name: 'Add note to "Shipped"' });
  expect(add).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Tracking note for order ABCDEF12 (optional)"), { target: { value: "Delhivery 998" } });
  fireEvent.click(add);
  await waitFor(() =>
    expect(axios.put).toHaveBeenCalledWith(
      "/api/v1/order/order-status/0000000000000000abcdef12",
      { status: "shipped", note: "Delhivery 998" }
    )
  );
  expect(await screen.findByText("Tracking note saved")).toBeInTheDocument();
});

test("cancelling asks for confirmation first", async () => {
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Cancel order" }));
  expect(confirm).toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button", { name: "Cancel order" })).toBeEnabled());
  expect(axios.put).not.toHaveBeenCalled();
});

test("a cancelled order has no status controls", async () => {
  renderPage("cancelled");
  expect(await screen.findByText("Order ABCDEF12")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Mark as/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancel order" })).not.toBeInTheDocument();
});

test("a delivered order can't be cancelled or moved on", async () => {
  renderPage("delivered");
  expect(await screen.findByText("Order ABCDEF12")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Mark as/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancel order" })).not.toBeInTheDocument();
});

test("an unpaid online order waits for payment", async () => {
  renderPage("placed", { paymentMethod: "razorpay", paymentStatus: "pending" });
  expect(await screen.findByRole("button", { name: "Mark as Packed" })).toBeDisabled();
  expect(screen.getByText("Waiting for the online payment before it can move on.")).toBeInTheDocument();
});

test("a refused step shows the API's message", async () => {
  axios.put.mockRejectedValue({ response: { data: { message: "This order was changed in the meantime. Reload and try again." } } });
  renderPage("placed");
  fireEvent.click(await screen.findByRole("button", { name: "Mark as Packed" }));
  expect(await screen.findByText("This order was changed in the meantime. Reload and try again.")).toBeInTheDocument();
});

test("shows payment method and status", async () => {
  renderPage("placed", { paymentMethod: "razorpay", paymentStatus: "paid", razorpayPaymentId: "pay_ABC" });
  expect(await screen.findByText("Payment: Online (Razorpay)")).toBeInTheDocument();
  expect(screen.getByText("Paid")).toBeInTheDocument();
  expect(screen.getByText("ID: pay_ABC")).toBeInTheDocument();
});

test("flags online payments that need a refund", async () => {
  renderPage("cancelled", { paymentMethod: "razorpay", paymentStatus: "paid", refundRequired: true });
  expect(await screen.findByText("Refund due")).toBeInTheDocument();
});

test("'Mark cash received' only appears for delivered, unpaid COD orders", async () => {
  renderPage("shipped");
  expect(await screen.findByText("Payment pending")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Mark cash received" })).not.toBeInTheDocument();
});

test("marking a delivered COD order as paid saves it", async () => {
  axios.put.mockResolvedValue({ data: { success: true, order: order("delivered", { paymentStatus: "paid" }) } });
  renderPage("delivered");
  fireEvent.click(await screen.findByRole("button", { name: "Mark cash received" }));
  await waitFor(() =>
    expect(axios.put).toHaveBeenCalledWith("/api/v1/order/mark-paid/0000000000000000abcdef12")
  );
  expect(await screen.findByText("Paid")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Mark cash received" })).not.toBeInTheDocument();
});
