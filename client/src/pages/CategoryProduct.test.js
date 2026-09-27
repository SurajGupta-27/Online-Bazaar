import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";
import axios from "axios";
import CategoryProduct from "./CategoryProduct";
import { AuthProvider } from "../context/auth";
import { SearchProvider } from "../context/search";
import { CartProvider } from "../context/cart";

jest.mock("axios", () => ({
  get: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const item = (id) => ({ _id: id, name: id, slug: id, description: "A long enough description", price: 5 });

beforeEach(() => {
  axios.get.mockImplementation((url) => {
    const pages = {
      "/api/v1/product/product-category/books?page=1": { products: ["Book 1", "Book 2"].map(item), total: 3, name: "Books" },
      "/api/v1/product/product-category/books?page=2": { products: ["Book 3"].map(item), total: 3, name: "Books" },
      "/api/v1/product/product-category/toys?page=1": { products: ["Toy 1"].map(item), total: 1, name: "Toys" },
    };
    const page = pages[url];
    return Promise.resolve({
      data: page ? { products: page.products, total: page.total, category: { name: page.name } } : {},
    });
  });
});

test("load more appends the next page, and switching category starts over", async () => {
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter initialEntries={["/category/books"]}>
            <Link to="/category/toys">go to toys</Link>
            <Routes>
              <Route path="/category/:slug" element={<CategoryProduct />} />
            </Routes>
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );

  expect(await screen.findByText("Book 2")).toBeInTheDocument();
  expect(screen.getByText("3 result found")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Loadmore"));
  expect(await screen.findByText("Book 3")).toBeInTheDocument();
  expect(screen.getByText("Book 1")).toBeInTheDocument();
  expect(screen.queryByText("Loadmore")).toBeNull();

  fireEvent.click(screen.getByText("go to toys"));
  expect(await screen.findByText("Toy 1")).toBeInTheDocument();
  expect(screen.queryByText("Book 1")).toBeNull();
  expect(screen.getByText("1 result found")).toBeInTheDocument();
});
