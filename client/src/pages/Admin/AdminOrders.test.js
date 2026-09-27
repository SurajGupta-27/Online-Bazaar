import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import AdminOrders from "./AdminOrders";
import { AuthProvider } from "../../context/auth";
import { SearchProvider } from "../../context/search";
import { CartProvider } from "../../context/cart";

jest.mock("axios", () => ({
  get: jest.fn(),
  put: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const order = (status) => ({
  _id: "0000000000000000abcdef12",
  status,
  user: { name: "Sam", email: "sam@x.com" },
  items: [{ name: "Pen", quantity: 3 }],
  total: 6,
  shippingAddress: "1 Road",
  createdAt: "2026-09-01T10:00:00Z",
});

const renderPage = (status = "placed") => {
  axios.get.mockResolvedValue({ data: { success: true, orders: [order(status)] } });
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter>
            <AdminOrders />
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );
};

// Opens the antd status Select and picks an option.
const chooseStatus = async (label) => {
  fireEvent.mouseDown(await screen.findByRole("combobox", { name: "Status of order ABCDEF12" }));
  fireEvent.click(await screen.findByTitle(label));
};

beforeEach(() => {
  axios.put.mockImplementation((url, body) =>
    Promise.resolve({ data: { success: true, order: order(body.status) } })
  );
});
afterEach(() => jest.restoreAllMocks());

test("lists orders with buyer, items, address and total", async () => {
  renderPage();
  expect(await screen.findByText("Order ABCDEF12")).toBeInTheDocument();
  expect(screen.getByText("Sam (sam@x.com)")).toBeInTheDocument();
  expect(screen.getByText("Pen x3")).toBeInTheDocument();
  expect(screen.getByText("Ship to: 1 Road")).toBeInTheDocument();
  expect(screen.getByText("$6.00")).toBeInTheDocument();
});

test("changing the status saves it", async () => {
  renderPage();
  await chooseStatus("Shipped");
  await waitFor(() =>
    expect(axios.put).toHaveBeenCalledWith(
      "/api/v1/order/order-status/0000000000000000abcdef12",
      { status: "shipped" }
    )
  );
});

test("cancelling asks for confirmation first", async () => {
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  renderPage();
  await chooseStatus("Cancelled");
  expect(confirm).toHaveBeenCalled();
  expect(axios.put).not.toHaveBeenCalled();
});

test("a cancelled order's status can't be changed", async () => {
  renderPage("cancelled");
  const select = await screen.findByRole("combobox", { name: "Status of order ABCDEF12" });
  expect(select).toBeDisabled();
});
