import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProductCard from "./ProductCard";
import { AuthProvider } from "../../context/auth";
import { CartProvider } from "../../context/cart";

jest.mock("axios", () => ({
  get: jest.fn(() => Promise.resolve({ data: {} })),
  post: jest.fn(),
  delete: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const product = (extra) => ({
  _id: "p1", name: "Pen", slug: "pen", description: "A pen", price: 120, quantity: 3, ...extra,
});

const renderCard = (p) =>
  render(
    <AuthProvider>
      <CartProvider>
        <MemoryRouter>
          <ProductCard product={p} />
        </MemoryRouter>
      </CartProvider>
    </AuthProvider>
  );

test("shows the average rating and review count", () => {
  renderCard(product({ ratingAverage: 4.5, ratingCount: 12 }));
  expect(screen.getByRole("img", { name: "Rated 4.5 out of 5" })).toBeInTheDocument();
  expect(screen.getByText("4.5")).toBeInTheDocument();
  expect(screen.getByText("(12 reviews)")).toBeInTheDocument();
});

test("one review is singular", () => {
  renderCard(product({ ratingAverage: 3, ratingCount: 1 }));
  expect(screen.getByText("(1 review)")).toBeInTheDocument();
});

test("a product without reviews says so", () => {
  renderCard(product());
  expect(screen.getByText("No reviews yet")).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: /Rated/ })).toBeNull();
});
