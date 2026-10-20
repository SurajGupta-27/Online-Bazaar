import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import Wishlist from "./Wishlist";
import { AuthProvider } from "../../context/auth";
import { SearchProvider } from "../../context/search";
import { CartProvider } from "../../context/cart";
import { WishlistProvider } from "../../context/wishlist";
import { fakeToken } from "../../testUtils/fakeToken";

jest.mock("axios", () => ({
  get: jest.fn(),
  delete: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const item = (id, name, price, quantity, priceWhenAdded = price) => ({
  product: { _id: id, name, slug: id, description: "d", price, quantity, ratingAverage: 4, ratingCount: 3 },
  priceWhenAdded,
  addedAt: "2026-10-01T10:00:00Z",
});

const renderPage = (items, user = { _id: "u1", name: "Gia", role: 0 }) => {
  localStorage.setItem("auth", JSON.stringify({ user, token: fakeToken() }));
  axios.get.mockImplementation((url) =>
    url === "/api/v1/wishlist"
      ? Promise.resolve({ data: { success: true, items } })
      : Promise.resolve({ data: { success: true, category: [] } })
  );
  axios.delete.mockResolvedValue({ data: { success: true } });
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <WishlistProvider>
            <MemoryRouter>
              <Wishlist />
            </MemoryRouter>
          </WishlistProvider>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );
};

afterEach(() => localStorage.clear());

test("lists saved products with price, rating, stock and price drops", async () => {
  renderPage([item("pen", "Pen", 99, 3, 120), item("ink", "Ink", 40, 0)]);
  const pen = (await screen.findByRole("link", { name: "Pen" })).closest("li");
  expect(within(pen).getByText("₹99")).toBeInTheDocument();
  expect(within(pen).getByText(/Price dropped from ₹120/)).toBeInTheDocument();
  expect(within(pen).getByText("In stock")).toBeInTheDocument();
  expect(within(pen).getByText("(3 reviews)")).toBeInTheDocument();
  const ink = screen.getByRole("link", { name: "Ink" }).closest("li");
  expect(within(ink).getByText("Out of stock")).toBeInTheDocument();
  expect(within(ink).getByRole("button", { name: "Move to cart" })).toBeDisabled();
  expect(within(ink).queryByText(/Price dropped/)).toBeNull();
  expect(screen.getByText("2 items")).toBeInTheDocument();
});

test("move to cart adds it to the cart and takes it off the wishlist", async () => {
  renderPage([item("pen", "Pen", 99, 3)]);
  const pen = (await screen.findByRole("link", { name: "Pen" })).closest("li");
  fireEvent.click(within(pen).getByRole("button", { name: "Move to cart" }));
  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith("/api/v1/wishlist/pen"));
  expect(JSON.parse(localStorage.getItem("cart")).map((p) => p._id)).toEqual(["pen"]);
  expect(await screen.findByText("Your wishlist is empty")).toBeInTheDocument();
});

test("remove takes it off without touching the cart", async () => {
  renderPage([item("pen", "Pen", 99, 3), item("ink", "Ink", 40, 5)]);
  const ink = (await screen.findByRole("link", { name: "Ink" })).closest("li");
  fireEvent.click(within(ink).getByRole("button", { name: "Remove" }));
  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith("/api/v1/wishlist/ink"));
  expect(screen.queryByRole("link", { name: "Ink" })).toBeNull();
  expect(screen.getByRole("link", { name: "Pen" })).toBeInTheDocument();
  expect(localStorage.getItem("cart")).toBeNull();
});

test("a failed remove puts the item back", async () => {
  renderPage([item("pen", "Pen", 99, 3)]);
  axios.delete.mockRejectedValue({ response: { status: 500, data: { message: "Unable to update your wishlist" } } });
  const pen = (await screen.findByRole("link", { name: "Pen" })).closest("li");
  fireEvent.click(within(pen).getByRole("button", { name: "Remove" }));
  await waitFor(() => expect(axios.delete).toHaveBeenCalled());
  expect(await screen.findByRole("link", { name: "Pen" })).toBeInTheDocument();
});

test("an empty wishlist links back to the shop", async () => {
  renderPage([]);
  expect(await screen.findByText("Your wishlist is empty")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Browse products" })).toHaveAttribute("href", "/");
});

test("each item shows that alerts are on, with what they cover", async () => {
  renderPage([item("pen", "Pen", 99, 3), item("ink", "Ink", 40, 0)], {
    _id: "u1", name: "Gia", role: 0, alerts: { priceDrop: true, backInStock: false },
  });
  const pen = (await screen.findByRole("link", { name: "Pen" })).closest("li");
  expect(within(pen).getByText("Alerts on")).toHaveAttribute("title", "We'll email you if the price drops");
  const ink = screen.getByRole("link", { name: "Ink" }).closest("li");
  expect(within(ink).getByText("Alerts on")).toBeInTheDocument();
});

test("no alerts indicator when both kinds of alert are turned off", async () => {
  renderPage([item("pen", "Pen", 99, 3)], {
    _id: "u1", name: "Gia", role: 0, alerts: { priceDrop: false, backInStock: false },
  });
  await screen.findByRole("link", { name: "Pen" });
  expect(screen.queryByText("Alerts on")).toBeNull();
});
