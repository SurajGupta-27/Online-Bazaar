import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import Profile from "./Profile";
import { AuthProvider } from "../../context/auth";
import { SearchProvider } from "../../context/search";
import { CartProvider } from "../../context/cart";
import { fakeToken } from "../../testUtils/fakeToken";

jest.mock("axios", () => ({
  get: jest.fn(() => Promise.resolve({ data: {} })),
  put: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

// A Google account as the API returns it: no password, phone or address.
const googleUser = {
  _id: "u1", name: "Gia", email: "gia@gmail.com", role: 0, hasPassword: false, googleLinked: true,
};

const renderProfile = (user, state) => {
  localStorage.setItem("auth", JSON.stringify({ user, token: fakeToken() }));
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter initialEntries={[{ pathname: "/dashboard/user/profile", state }]}>
            <Routes>
              <Route path="/dashboard/user/profile" element={<Profile />} />
              <Route path="/cart" element={<div>Cart page</div>} />
            </Routes>
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );
};

// CRA resets mocks between tests; the header still loads categories.
beforeEach(() => axios.get.mockResolvedValue({ data: { success: true, category: [] } }));
afterEach(() => localStorage.clear());

test("a Google account is asked for a phone and address and can set a password", async () => {
  renderProfile(googleUser);
  expect(await screen.findByDisplayValue("Gia")).toBeInTheDocument();
  expect(screen.getByText("Signed in with Google")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Add your phone number and delivery address");
  expect(screen.getByLabelText("Set a password")).toHaveAttribute("placeholder", "Set a password (optional)");
  expect(screen.getByLabelText("Phone")).toHaveValue("");
  expect(screen.getByLabelText("Address")).toHaveValue("");
});

test("completing the profile saves it and returns to the cart", async () => {
  const updated = { ...googleUser, phone: "98765", address: "1 MG Road", hasPassword: true };
  axios.put.mockResolvedValue({ data: { success: true, updatedUser: updated } });
  renderProfile(googleUser, "/cart");
  await screen.findByDisplayValue("Gia");
  fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "98765" } });
  fireEvent.change(screen.getByLabelText("Address"), { target: { value: "1 MG Road" } });
  fireEvent.change(screen.getByLabelText("Set a password"), { target: { value: "gia-pass1" } });
  fireEvent.click(screen.getByRole("button", { name: "UPDATE" }));

  expect(await screen.findByText("Cart page")).toBeInTheDocument();
  expect(axios.put).toHaveBeenCalledWith("/api/v1/auth/profile", expect.objectContaining({
    phone: "98765", address: "1 MG Road", password: "gia-pass1",
  }));
  expect(JSON.parse(localStorage.getItem("auth")).user).toEqual(updated);
});

test("a complete password account sees no reminder", async () => {
  renderProfile({ ...googleUser, phone: "1", address: "a", hasPassword: true, googleLinked: false });
  expect(await screen.findByDisplayValue("Gia")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByText("Signed in with Google")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Password")).toBeInTheDocument();
});

test("staying on the page when the profile is still incomplete", async () => {
  axios.put.mockResolvedValue({ data: { success: true, updatedUser: { ...googleUser, phone: "98765" } } });
  renderProfile(googleUser, "/cart");
  await screen.findByDisplayValue("Gia");
  fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "98765" } });
  fireEvent.click(screen.getByRole("button", { name: "UPDATE" }));
  await waitFor(() => expect(axios.put).toHaveBeenCalled());
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText("Cart page")).not.toBeInTheDocument();
});
