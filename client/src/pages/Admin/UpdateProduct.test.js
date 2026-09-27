import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import UpdateProduct from "./UpdateProduct";
import { AuthProvider } from "../../context/auth";
import { SearchProvider } from "../../context/search";
import { CartProvider } from "../../context/cart";

jest.mock("axios", () => ({
  get: jest.fn(),
  put: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const renderWithShipping = (shipping) => {
  axios.get.mockImplementation((url) => {
    if (url === "/api/v1/product/get-product/pen") {
      return Promise.resolve({
        data: {
          product: {
            _id: "p1", name: "Pen", description: "Blue", price: 2, quantity: 5,
            shipping, category: { _id: "c1", name: "Office" },
          },
        },
      });
    }
    if (url === "/api/v1/category/get-category") {
      return Promise.resolve({ data: { success: true, category: [{ _id: "c1", name: "Office" }] } });
    }
    return Promise.resolve({ data: {} });
  });
  axios.put.mockResolvedValue({ data: { success: true } });
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter initialEntries={["/dashboard/admin/product/pen"]}>
            <Routes>
              <Route path="/dashboard/admin/product/:slug" element={<UpdateProduct />} />
              <Route path="/dashboard/admin/products" element={<div>Products list</div>} />
            </Routes>
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );
};

test.each([
  [true, "Yes", "1"],
  [false, "No", "0"],
])("shipping=%s shows %s and submits %s", async (shipping, label, sent) => {
  renderWithShipping(shipping);
  expect(await screen.findByDisplayValue("Pen")).toBeInTheDocument();
  expect(await screen.findByText(label)).toBeInTheDocument();

  fireEvent.click(screen.getByText("UPDATE PRODUCT"));
  await waitFor(() => expect(axios.put).toHaveBeenCalled());
  const body = axios.put.mock.calls[0][1];
  expect(body.get("shipping")).toBe(sent);
  expect(await screen.findByText("Products list")).toBeInTheDocument();
});
