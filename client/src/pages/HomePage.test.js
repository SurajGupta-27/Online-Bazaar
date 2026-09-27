import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import HomePage from "./HomePage";
import { AuthProvider } from "../context/auth";
import { SearchProvider } from "../context/search";
import { CartProvider } from "../context/cart";

jest.mock("axios", () => ({
  get: jest.fn(),
  post: jest.fn(),
  defaults: { headers: { common: {} } },
}));

const product = (id, name) => ({
  _id: id,
  name,
  slug: id,
  description: "A description long enough",
  price: 10,
});

// A promise the test resolves by hand, to control response order.
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

const renderPage = () =>
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter>
            <HomePage />
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );

let listPage1;
beforeEach(() => {
  listPage1 = deferred();
  axios.get.mockImplementation((url) => {
    if (url === "/api/v1/category/get-category") {
      return Promise.resolve({
        data: { success: true, category: [{ _id: "c1", name: "Books", slug: "books" }] },
      });
    }
    if (url === "/api/v1/product/product-count") {
      return Promise.resolve({ data: { total: 20 } });
    }
    if (url === "/api/v1/product/product-list/1") return listPage1.promise;
    if (url === "/api/v1/product/product-list/2") {
      return Promise.resolve({ data: { products: [product("p2", "Page Two Item")] } });
    }
    return Promise.resolve({ data: {} });
  });
  axios.post.mockResolvedValue({ data: { products: [product("f1", "Filtered Book")] } });
});

test("a slow unfiltered response does not overwrite filtered results", async () => {
  renderPage();
  // Check a category while the first page is still loading.
  fireEvent.click(await screen.findByRole("checkbox", { name: "Books" }));
  expect(await screen.findAllByText("Filtered Book")).not.toHaveLength(0);

  // The stale unfiltered response arrives afterwards and must be ignored.
  await act(async () => {
    listPage1.resolve({ data: { products: [product("u1", "Unfiltered Item")] } });
  });
  expect(screen.queryByText("Unfiltered Item")).toBeNull();
  expect(screen.queryByText("Loadmore")).toBeNull();
});

test("load more appends pages and reset returns to the unfiltered list", async () => {
  renderPage();
  await act(async () => {
    listPage1.resolve({ data: { products: [product("u1", "Unfiltered Item")] } });
  });
  fireEvent.click(await screen.findByText("Loadmore"));
  expect(await screen.findByText("Page Two Item")).toBeInTheDocument();
  expect(screen.getByText("Unfiltered Item")).toBeInTheDocument();

  const box = screen.getByRole("checkbox", { name: "Books" });
  fireEvent.click(box);
  expect(await screen.findByText("Filtered Book")).toBeInTheDocument();
  expect(screen.queryByText("Loadmore")).toBeNull();

  fireEvent.click(screen.getByText("RESET FILTERS"));
  expect(await screen.findByText("Unfiltered Item")).toBeInTheDocument();
  expect(screen.queryByText("Filtered Book")).toBeNull();
  expect(box).not.toBeChecked();
});
