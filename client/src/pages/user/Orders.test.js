import { render, screen } from "@testing-library/react";
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
