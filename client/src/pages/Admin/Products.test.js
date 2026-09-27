import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import Products from "./Products";
import { AuthProvider } from "../../context/auth";
import { SearchProvider } from "../../context/search";
import { CartProvider } from "../../context/cart";

jest.mock("axios", () => ({
  get: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const pageOf = (page) =>
  Array.from({ length: page < 3 ? 12 : 6 }, (_, i) => {
    const n = (page - 1) * 12 + i + 1;
    return { _id: `p${n}`, name: `Product ${n}`, slug: `product-${n}`, description: "d" };
  });

test("shows every product across pages instead of only 12", async () => {
  axios.get.mockImplementation((url) => {
    if (url === "/api/v1/product/product-count") return Promise.resolve({ data: { total: 30 } });
    const match = url.match(/^\/api\/v1\/product\/product-list\/(\d+)\?perPage=12$/);
    if (match) return Promise.resolve({ data: { products: pageOf(Number(match[1])) } });
    return Promise.resolve({ data: {} });
  });
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter>
            <Products />
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );

  expect(await screen.findByText("Product 12")).toBeInTheDocument();
  fireEvent.click(await screen.findByTitle("3"));
  expect(await screen.findByText("Product 30")).toBeInTheDocument();
  expect(screen.queryByText("Product 12")).toBeNull();
  await waitFor(() =>
    expect(axios.get).toHaveBeenCalledWith("/api/v1/product/product-list/3?perPage=12")
  );
});
