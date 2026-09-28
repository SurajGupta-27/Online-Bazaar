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

const renderWithShipping = (shipping, category = { _id: "c1", name: "Office" }, images = []) => {
  axios.get.mockImplementation((url) => {
    if (url === "/api/v1/product/get-product/pen") {
      return Promise.resolve({
        data: {
          product: {
            _id: "p1", name: "Pen", description: "Blue", price: 2, quantity: 5,
            shipping, category, images,
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

test("a product whose category was deleted still loads for editing", async () => {
  renderWithShipping(true, null);
  expect(await screen.findByDisplayValue("Pen")).toBeInTheDocument();
  expect(screen.getByText("Select a category")).toBeInTheDocument();
});

test("saved images load into the picker and their order is submitted", async () => {
  const images = ["one", "two"].map((id) => ({
    url: `https://res.cloudinary.com/demo/image/upload/v1/${id}.png`,
    publicId: id,
  }));
  renderWithShipping(true, undefined, images);
  fireEvent.click(await screen.findByRole("button", { name: "Make Photo 2 the main image" }));
  fireEvent.click(screen.getByText("UPDATE PRODUCT"));
  await waitFor(() => expect(axios.put).toHaveBeenCalled());
  const body = axios.put.mock.calls[0][1];
  expect(JSON.parse(body.get("images"))).toEqual(["two", "one"]);
  expect(body.getAll("photos")).toEqual([]);
});
