import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import App from "./App";
import { AuthProvider } from "./context/auth";
import { SearchProvider } from "./context/search";
import { CartProvider } from "./context/cart";
import { WishlistProvider } from "./context/wishlist";

jest.mock("axios", () => ({
  get: jest.fn(),
  post: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

beforeEach(() => {
  axios.get.mockImplementation((url) => {
    if (url === "/api/v1/category/get-category") {
      return Promise.resolve({
        data: { success: true, category: [{ _id: "c1", name: "Books", slug: "books" }] },
      });
    }
    if (url === "/api/v1/product/product-count") return Promise.resolve({ data: { total: 1 } });
    if (url.startsWith("/api/v1/product/product-list/")) {
      return Promise.resolve({
        data: {
          products: [
            { _id: "p1", name: "Blue Pen", slug: "blue-pen", description: "A smooth blue pen", price: 3 },
          ],
        },
      });
    }
    return Promise.resolve({ data: {} });
  });
});
afterEach(() => localStorage.clear());

// Same provider order as src/index.js.
const renderAt = (path) =>
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <WishlistProvider>
            <MemoryRouter initialEntries={[path]}>
              <App />
            </MemoryRouter>
          </WishlistProvider>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );

test("home page shows the header, categories and products", async () => {
  renderAt("/");
  expect(await screen.findByText("Blue Pen")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "All products" })).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Books" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Login" })).toBeInTheDocument();
});

test("unknown URLs show the 404 page", async () => {
  renderAt("/no-such-page");
  expect(await screen.findByText("Oops ! Page Not Found")).toBeInTheDocument();
});

test("signed-out visitors to the dashboard are sent to login", async () => {
  jest.useFakeTimers();
  try {
    renderAt("/dashboard/user");
    expect(await screen.findByText(/redirecting/i)).toBeInTheDocument();
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }
    expect(await screen.findByText("LOGIN FORM")).toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});
