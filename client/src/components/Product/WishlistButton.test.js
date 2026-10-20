import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import axios from "axios";
import ProductCard from "./ProductCard";
import { AuthProvider } from "../../context/auth";
import { CartProvider } from "../../context/cart";
import { WishlistProvider } from "../../context/wishlist";
import { fakeToken } from "../../testUtils/fakeToken";

jest.mock("axios", () => ({
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const pen = { _id: "p1", name: "Pen", slug: "pen", description: "A pen", price: 120, quantity: 3 };
const LoginStub = () => <div>Login page, back to {useLocation().state}</div>;

const renderCard = () =>
  render(
    <AuthProvider>
      <CartProvider>
        <WishlistProvider>
          <MemoryRouter initialEntries={["/category/pens"]}>
            <Routes>
              <Route path="/category/pens" element={<ProductCard product={pen} />} />
              <Route path="/login" element={<LoginStub />} />
            </Routes>
            <Toaster />
          </MemoryRouter>
        </WishlistProvider>
      </CartProvider>
    </AuthProvider>
  );

const signIn = () =>
  localStorage.setItem("auth", JSON.stringify({ user: { _id: "u1", name: "Gia", role: 0 }, token: fakeToken() }));

beforeEach(() => {
  axios.get.mockImplementation((url) =>
    url === "/api/v1/wishlist"
      ? Promise.resolve({ data: { success: true, items: [] } })
      : Promise.resolve({ data: {} })
  );
});
afterEach(() => {
  localStorage.clear();
  // Toasts live in one global store; don't let them leak into the next test.
  act(() => toast.remove());
});

test("logged out: the heart asks to log in and comes back here afterwards", async () => {
  renderCard();
  fireEvent.click(screen.getByRole("button", { name: "Add to wishlist" }));
  expect(await screen.findByText("Login page, back to /category/pens")).toBeInTheDocument();
  expect(await screen.findByText("Log in to save items to your wishlist")).toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();
  expect(axios.get).not.toHaveBeenCalledWith("/api/v1/wishlist");
});

test("signed in: the heart adds and removes the product", async () => {
  signIn();
  axios.post.mockResolvedValue({ data: { success: true } });
  axios.delete.mockResolvedValue({ data: { success: true } });
  renderCard();
  await waitFor(() => expect(axios.get).toHaveBeenCalledWith("/api/v1/wishlist"));

  const heart = screen.getByRole("button", { name: "Add to wishlist" });
  expect(heart).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(heart);
  expect(await screen.findByText("Added to your wishlist")).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledWith("/api/v1/wishlist/p1");
  const saved = screen.getByRole("button", { name: "Remove from wishlist" });
  expect(saved).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(saved);
  expect(await screen.findByText("Removed from your wishlist")).toBeInTheDocument();
  expect(axios.delete).toHaveBeenCalledWith("/api/v1/wishlist/p1");
  expect(screen.getByRole("button", { name: "Add to wishlist" })).toBeInTheDocument();
});

test("a saved product shows a filled heart when the page loads", async () => {
  signIn();
  axios.get.mockResolvedValue({ data: { success: true, items: [{ product: pen, priceWhenAdded: 120 }] } });
  renderCard();
  expect(await screen.findByRole("button", { name: "Remove from wishlist" })).toHaveAttribute("aria-pressed", "true");
});

test("if saving fails the heart goes back and the error is shown", async () => {
  signIn();
  axios.post.mockRejectedValue({ response: { status: 400, data: { message: "Your wishlist is full (100 items). Remove something first." } } });
  renderCard();
  await waitFor(() => expect(axios.get).toHaveBeenCalledWith("/api/v1/wishlist"));
  fireEvent.click(screen.getByRole("button", { name: "Add to wishlist" }));
  expect(await screen.findByText(/Your wishlist is full/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add to wishlist" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByText("Added to your wishlist")).toBeNull();
});
