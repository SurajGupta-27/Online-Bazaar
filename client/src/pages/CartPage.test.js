import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import axios from "axios";
import CartPage from "./CartPage";
import { AuthProvider } from "../context/auth";
import { SearchProvider } from "../context/search";
import { CartProvider } from "../context/cart";
import { fakeToken } from "../testUtils/fakeToken";

jest.mock("axios", () => ({
  get: jest.fn(() => Promise.resolve({ data: {} })),
  post: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const product = (id, name, price, stock) => ({
  _id: id, name, slug: id, description: "A long enough description", price, quantity: stock,
});

beforeEach(() => {
  localStorage.setItem(
    "auth",
    JSON.stringify({ user: { name: "Sam", phone: "98765", address: "1 Road" }, token: fakeToken() })
  );
  // Saved before cartQuantity existed: both lines default to 1.
  localStorage.setItem(
    "cart",
    JSON.stringify([product("pen", "Pen", 10, 5), product("ink", "Ink", 2.5, 50)])
  );
  axios.post.mockResolvedValue({ data: { success: true } });
});
afterEach(() => localStorage.clear());

const renderCart = () =>
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter initialEntries={["/cart"]}>
            <Routes>
              <Route path="/cart" element={<CartPage />} />
              <Route path="/dashboard/user/orders" element={<div>Orders page</div>} />
              <Route path="/dashboard/user/profile" element={<ProfileStub />} />
            </Routes>
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );

const ProfileStub = () => <div>Profile page, back to {useLocation().state}</div>;

test("a Google account without a phone or address is asked to complete its profile", async () => {
  localStorage.setItem(
    "auth",
    JSON.stringify({ user: { name: "Gia", hasPassword: false, googleLinked: true }, token: fakeToken() })
  );
  renderCart();
  expect(
    await screen.findByText(/Add your phone number and delivery address to your profile/)
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Place order/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Complete your profile" }));
  expect(await screen.findByText("Profile page, back to /cart")).toBeInTheDocument();
});

test("a phone number alone isn't enough to check out", async () => {
  localStorage.setItem(
    "auth",
    JSON.stringify({ user: { name: "Gia", phone: "98765" }, token: fakeToken() })
  );
  renderCart();
  expect(await screen.findByRole("button", { name: "Complete your profile" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Place order/ })).not.toBeInTheDocument();
});


test("quantity choices are limited by stock (max 10) and default to 1", async () => {
  renderCart();
  expect(await screen.findByText("Total : ₹12.50")).toBeInTheDocument();
  const [penSelect, inkSelect] = screen.getAllByRole("combobox");
  expect(penSelect).toHaveValue("1");
  expect(within(penSelect).getAllByRole("option")).toHaveLength(5);
  expect(within(inkSelect).getAllByRole("option")).toHaveLength(10);
});

test("the chosen quantity updates the total, is saved, and is sent with the order", async () => {
  renderCart();
  const [penSelect] = await screen.findAllByRole("combobox");
  fireEvent.change(penSelect, { target: { value: "3" } });

  expect(screen.getByText("Total : ₹32.50")).toBeInTheDocument();
  expect(screen.getByText(/You Have 4 items/)).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("cart"))[0].cartQuantity).toBe(3);

  fireEvent.click(screen.getByText("Place order"));
  await waitFor(() =>
    expect(axios.post).toHaveBeenCalledWith("/api/v1/order/create-order", {
      shippingAddress: "1 Road",
      paymentMethod: "cod",
      items: [
        { product: "pen", quantity: 3 },
        { product: "ink", quantity: 1 },
      ],
    })
  );
  expect(await screen.findByText("Orders page")).toBeInTheDocument();
});

// --- payment method ---------------------------------------------------------

// Stands in for Razorpay Checkout: records the options and lets tests trigger
// its callbacks (success handler, popup closed, failed attempt).
let checkout;
class FakeRazorpay {
  constructor(options) {
    this.options = options;
    this.listeners = {};
    checkout = this;
  }
  on(event, fn) {
    this.listeners[event] = fn;
  }
  open() {
    this.opened = true;
  }
}

const onlineOrder = {
  order: { _id: "0000000000000000abcdef12" },
  payment: { keyId: "rzp_test_key", razorpayOrderId: "order_rp1", amount: 1250, currency: "INR", timeout: 600 },
};

const startOnlinePayment = async () => {
  axios.post.mockImplementation((url) =>
    Promise.resolve({ data: url.endsWith("create-order") ? { success: true, ...onlineOrder } : { success: true } })
  );
  renderCart();
  fireEvent.click(await screen.findByLabelText(/Pay Online \(Razorpay\)/));
  fireEvent.click(screen.getByRole("button", { name: "Pay ₹12.50" }));
  await waitFor(() => expect(checkout?.opened).toBe(true));
};

beforeEach(() => {
  checkout = undefined;
  window.Razorpay = FakeRazorpay;
});
afterEach(() => {
  delete window.Razorpay;
});

test("Cash on Delivery is the default choice", async () => {
  renderCart();
  expect(await screen.findByLabelText(/Cash on Delivery/)).toBeChecked();
  expect(screen.getByLabelText(/Pay Online \(Razorpay\)/)).not.toBeChecked();
});

test("paying online opens Checkout with the server's order, key and amount", async () => {
  await startOnlinePayment();
  expect(axios.post).toHaveBeenCalledWith(
    "/api/v1/order/create-order",
    expect.objectContaining({ paymentMethod: "razorpay" })
  );
  expect(checkout.options).toMatchObject({
    key: "rzp_test_key",
    order_id: "order_rp1",
    amount: 1250,
    currency: "INR",
    timeout: 600,
    prefill: { name: "Sam" },
  });
  expect(screen.getByRole("button", { name: "Waiting for payment..." })).toBeDisabled();
});

test("a successful payment is verified by the server before the cart is cleared", async () => {
  await startOnlinePayment();
  expect(JSON.parse(localStorage.getItem("cart"))).toHaveLength(2);

  await checkout.options.handler({
    razorpay_payment_id: "pay_1",
    razorpay_order_id: "order_rp1",
    razorpay_signature: "sig",
  });
  expect(axios.post).toHaveBeenCalledWith("/api/v1/order/verify-payment", {
    orderId: "0000000000000000abcdef12",
    razorpay_payment_id: "pay_1",
    razorpay_signature: "sig",
  });
  expect(await screen.findByText("Orders page")).toBeInTheDocument();
  expect(localStorage.getItem("cart")).toBeNull();
});

test("closing Checkout cancels the order and keeps the cart", async () => {
  await startOnlinePayment();
  await checkout.options.modal.ondismiss();
  expect(axios.post).toHaveBeenCalledWith("/api/v1/order/cancel-payment/0000000000000000abcdef12");
  expect(JSON.parse(localStorage.getItem("cart"))).toHaveLength(2);
  expect(await screen.findByRole("button", { name: "Pay ₹12.50" })).toBeEnabled();
});

test("a failed attempt leaves Checkout open for a retry", async () => {
  await startOnlinePayment();
  checkout.listeners["payment.failed"]({ error: { description: "Card declined" } });
  expect(axios.post).not.toHaveBeenCalledWith(expect.stringContaining("cancel-payment"));
  expect(JSON.parse(localStorage.getItem("cart"))).toHaveLength(2);
});

test("a failed verification keeps the cart", async () => {
  await startOnlinePayment();
  axios.post.mockRejectedValueOnce({ response: { status: 400, data: { message: "Payment verification failed" } } });
  await checkout.options.handler({ razorpay_payment_id: "pay_1", razorpay_signature: "bad" });
  expect(JSON.parse(localStorage.getItem("cart"))).toHaveLength(2);
  expect(screen.queryByText("Orders page")).not.toBeInTheDocument();
});

test("if the order can't be created, Checkout never opens", async () => {
  axios.post.mockRejectedValue({ response: { status: 409, data: { message: "Pen does not have enough stock" } } });
  renderCart();
  fireEvent.click(await screen.findByLabelText(/Pay Online \(Razorpay\)/));
  fireEvent.click(screen.getByRole("button", { name: "Pay ₹12.50" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Pay ₹12.50" })).toBeEnabled());
  expect(checkout).toBeUndefined();
});
