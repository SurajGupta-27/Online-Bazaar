import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import Users from "./Users";
import { AuthProvider } from "../../context/auth";
import { SearchProvider } from "../../context/search";
import { CartProvider } from "../../context/cart";

jest.mock("axios", () => ({
  get: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

test("lists every user with their role", async () => {
  axios.get.mockImplementation((url) =>
    url === "/api/v1/auth/all-users"
      ? Promise.resolve({
          data: {
            success: true,
            users: [
              { _id: "u2", name: "Sam", email: "sam@x.com", phone: "123", address: "1 Road", role: 0, createdAt: "2026-09-01T10:00:00Z" },
              { _id: "u1", name: "Ada", email: "ada@x.com", phone: "456", address: "2 Lane", role: 1, createdAt: "2026-08-01T10:00:00Z" },
            ],
          },
        })
      : Promise.resolve({ data: {} })
  );
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter>
            <Users />
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );

  expect(await screen.findByText("2 registered")).toBeInTheDocument();
  const rows = screen.getAllByRole("row").slice(1);
  expect(within(rows[0]).getByText("sam@x.com")).toBeInTheDocument();
  expect(within(rows[0]).getByText("Customer")).toBeInTheDocument();
  expect(within(rows[1]).getByText("Ada")).toBeInTheDocument();
  expect(within(rows[1]).getByText("Admin")).toBeInTheDocument();
});
