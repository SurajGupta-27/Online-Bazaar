import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import ProductDetails from "./ProductDetails";
import { AuthProvider } from "../context/auth";
import { SearchProvider } from "../context/search";
import { CartProvider } from "../context/cart";
import { watchKeyWarnings } from "../testUtils/keyWarnings";

jest.mock("axios", () => ({
  get: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const renderAt = (slug) =>
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter initialEntries={[`/product/${slug}`]}>
            <Routes>
              <Route path="/product/:slug" element={<ProductDetails />} />
            </Routes>
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );

const photoSrcs = () =>
  [...document.querySelectorAll("img")].map((img) => img.getAttribute("src"));

test("no photo request with an undefined id while loading, then the real one", async () => {
  axios.get.mockImplementation((url) =>
    url.startsWith("/api/v1/product/get-product/")
      ? Promise.resolve({ data: { product: { _id: "p1", name: "Pen", description: "Blue", price: 2, category: { _id: "c1", name: "Office" } } } })
      : Promise.resolve({ data: { products: [] } })
  );
  renderAt("pen");
  expect(photoSrcs().some((src) => src?.includes("undefined"))).toBe(false);
  expect(await screen.findByText("Name : Pen")).toBeInTheDocument();
  expect(photoSrcs()).toContain("/api/v1/product/product-photo/p1");
});

test("an unknown product slug doesn't crash the page", async () => {
  axios.get.mockResolvedValue({ data: { product: null } });
  renderAt("missing");
  expect(await screen.findByText("Product Details")).toBeInTheDocument();
  expect(photoSrcs().some((src) => src?.includes("product-photo"))).toBe(false);
});

test("similar products render without key warnings", async () => {
  const keys = watchKeyWarnings();
  axios.get.mockImplementation((url) =>
    url.startsWith("/api/v1/product/get-product/")
      ? Promise.resolve({ data: { product: { _id: "p1", name: "Pen", description: "Blue", price: 2, category: { _id: "c1", name: "Office" } } } })
      : Promise.resolve({ data: { products: [
          { _id: "p2", name: "Pencil", slug: "pencil", description: "Graphite pencil", price: 1 },
          { _id: "p3", name: "Marker", slug: "marker", description: "Black marker", price: 3 },
        ] } })
  );
  renderAt("pen");
  expect(await screen.findByText("Pencil")).toBeInTheDocument();
  keys.restore();
  expect(keys.warnings).toEqual([]);
});
