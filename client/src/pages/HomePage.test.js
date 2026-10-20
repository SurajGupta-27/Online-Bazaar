import { render, screen, fireEvent, act, within } from "@testing-library/react";
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
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
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
  expect(screen.queryByText("Load more")).toBeNull();
});

test("load more appends pages and reset returns to the unfiltered list", async () => {
  renderPage();
  await act(async () => {
    listPage1.resolve({ data: { products: [product("u1", "Unfiltered Item")] } });
  });
  fireEvent.click(await screen.findByText("Load more"));
  expect(await screen.findByText("Page Two Item")).toBeInTheDocument();
  expect(screen.getByText("Unfiltered Item")).toBeInTheDocument();

  const box = screen.getByRole("checkbox", { name: "Books" });
  fireEvent.click(box);
  expect(await screen.findByText("Filtered Book")).toBeInTheDocument();
  expect(screen.queryByText("Load more")).toBeNull();

  fireEvent.click(screen.getByText("Reset filters"));
  expect(await screen.findByText("Unfiltered Item")).toBeInTheDocument();
  expect(screen.queryByText("Filtered Book")).toBeNull();
  expect(box).not.toBeChecked();
});

test("the hero links to categories and counts the catalogue", async () => {
  renderPage();
  await act(async () => {
    listPage1.resolve({ data: { products: [product("u1", "Unfiltered Item")] } });
  });
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Everything you love/);
  const popular = screen.getByRole("navigation", { name: "Popular categories" });
  expect(within(popular).getByRole("link", { name: "Books" })).toHaveAttribute("href", "/category/books");
  expect(screen.getByText("20 products")).toBeInTheDocument();
  expect(screen.getByText("Across 1 category")).toBeInTheDocument();
});

test("product cards show prices in rupees", async () => {
  renderPage();
  await act(async () => {
    listPage1.resolve({ data: { products: [{ ...product("u1", "Kettle"), price: 1299 }] } });
  });
  expect(screen.getByText("₹1,299")).toBeInTheDocument();
});

test("sort by asks the API for that order, for the list, load more and filters", async () => {
  axios.get.mockImplementation((url) => {
    if (url === "/api/v1/product/product-count") return Promise.resolve({ data: { total: 20 } });
    if (url === "/api/v1/category/get-category") {
      return Promise.resolve({
        data: { success: true, category: [{ _id: "c1", name: "Books", slug: "books" }] },
      });
    }
    if (url === "/api/v1/product/product-list/1?sort=price_asc") {
      return Promise.resolve({ data: { products: [product("cheap", "Cheapest Item")] } });
    }
    if (url === "/api/v1/product/product-list/2?sort=price_asc") {
      return Promise.resolve({ data: { products: [product("next", "Next Cheapest")] } });
    }
    return Promise.resolve({ data: { products: [product("u1", "Newest Item")] } });
  });
  renderPage();
  const select = await screen.findByRole("combobox", { name: "Sort by" });
  expect(select).toHaveValue("newest");
  expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
    "Newest", "Price: low to high", "Price: high to low", "Highest rated",
  ]);

  fireEvent.change(select, { target: { value: "price_asc" } });
  expect(await screen.findAllByText("Cheapest Item")).not.toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findAllByText("Next Cheapest")).not.toHaveLength(0);

  fireEvent.click(screen.getByRole("checkbox", { name: "Books" }));
  await screen.findAllByText("Filtered Book");
  expect(axios.post).toHaveBeenLastCalledWith("/api/v1/product/product-filters", {
    checked: ["c1"], radio: [], sort: "price_asc",
  });
});
