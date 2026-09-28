import { render, screen, fireEvent } from "@testing-library/react";
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
  screen.queryAllByRole("img").map((img) => img.getAttribute("src"));

test("no photo request with an undefined id while loading, then the real one", async () => {
  axios.get.mockImplementation((url) =>
    url.startsWith("/api/v1/product/get-product/")
      ? Promise.resolve({ data: { product: { _id: "p1", name: "Pen", description: "Blue", price: 2, category: { _id: "c1", name: "Office" } } } })
      : Promise.resolve({ data: { products: [] } })
  );
  renderAt("pen");
  expect(photoSrcs().some((src) => src?.includes("undefined"))).toBe(false);
  expect(await screen.findByRole("heading", { name: "Pen" })).toBeInTheDocument();
  expect(photoSrcs()).toContain("/api/v1/product/product-photo/p1");
});

test("an unknown product slug doesn't crash the page", async () => {
  axios.get.mockResolvedValue({ data: { product: null } });
  renderAt("missing");
  expect(await screen.findByText("Product Details")).toBeInTheDocument();
  expect(photoSrcs().some((src) => src?.includes("product-photo"))).toBe(false);
});

const cloudUrl = (id) => `https://res.cloudinary.com/demo/image/upload/v1/${id}.png`;
const withImages = (ids) => (url) =>
  url.startsWith("/api/v1/product/get-product/")
    ? Promise.resolve({ data: { product: {
        _id: "p1", name: "Pen", description: "Blue", price: 2, quantity: 3,
        images: ids.map((id) => ({ url: cloudUrl(id), publicId: id })),
        category: { _id: "c1", name: "Office" },
      } } })
    : Promise.resolve({ data: { products: [] } });

test("several images show a gallery that switches the main image", async () => {
  axios.get.mockImplementation(withImages(["front", "back"]));
  renderAt("pen");
  const main = await screen.findByRole("img", { name: "Pen" });
  expect(main).toHaveAttribute("src", expect.stringMatching(/f_auto,q_auto,c_limit,w_900\/v1\/front\.png$/));
  const second = screen.getByRole("button", { name: "Show photo 2 of 2" });
  fireEvent.click(second);
  expect(main).toHaveAttribute("src", expect.stringMatching(/\/back\.png$/));
  expect(second).toHaveAttribute("aria-pressed", "true");
  expect(photoSrcs().some((src) => src?.includes("product-photo"))).toBe(false);
});

test("a product with one image shows no thumbnails", async () => {
  axios.get.mockImplementation(withImages(["front"]));
  renderAt("pen");
  expect(await screen.findByRole("img", { name: "Pen" })).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Product photos" })).toBeNull();
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
