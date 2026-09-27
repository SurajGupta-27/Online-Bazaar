import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
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
    JSON.stringify({ user: { name: "Sam", address: "1 Road" }, token: fakeToken() })
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
            </Routes>
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );


test("quantity choices are limited by stock (max 10) and default to 1", async () => {
  renderCart();
  expect(await screen.findByText("Total : $12.50")).toBeInTheDocument();
  const [penSelect, inkSelect] = screen.getAllByRole("combobox");
  expect(penSelect).toHaveValue("1");
  expect(within(penSelect).getAllByRole("option")).toHaveLength(5);
  expect(within(inkSelect).getAllByRole("option")).toHaveLength(10);
});

test("the chosen quantity updates the total, is saved, and is sent with the order", async () => {
  renderCart();
  const [penSelect] = await screen.findAllByRole("combobox");
  fireEvent.change(penSelect, { target: { value: "3" } });

  expect(screen.getByText("Total : $32.50")).toBeInTheDocument();
  expect(screen.getByText(/You Have 4 items/)).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("cart"))[0].cartQuantity).toBe(3);

  fireEvent.click(screen.getByText("Place order"));
  await waitFor(() =>
    expect(axios.post).toHaveBeenCalledWith("/api/v1/order/create-order", {
      shippingAddress: "1 Road",
      items: [
        { product: "pen", quantity: 3 },
        { product: "ink", quantity: 1 },
      ],
    })
  );
  expect(await screen.findByText("Orders page")).toBeInTheDocument();
});
