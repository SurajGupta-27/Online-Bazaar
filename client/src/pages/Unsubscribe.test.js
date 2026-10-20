import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import Unsubscribe from "./Unsubscribe";
import { AuthProvider } from "../context/auth";
import { SearchProvider } from "../context/search";
import { CartProvider } from "../context/cart";

jest.mock("axios", () => ({
  get: jest.fn(() => Promise.resolve({ data: {} })),
  post: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const link = { u: "u1", k: "price_drop", t: "signed-token" };
const renderPage = (query = new URLSearchParams(link).toString()) =>
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter initialEntries={[`/unsubscribe?${query}`]}>
            <Routes>
              <Route path="/unsubscribe" element={<Unsubscribe />} />
            </Routes>
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );

const answer = (subscribed) => ({ data: { success: true, kind: "price_drop", label: "price-drop alerts", subscribed } });

test("opening the link unsubscribes at once, without logging in, and can be undone", async () => {
  axios.post.mockImplementation((url) => Promise.resolve(answer(url.endsWith("/resubscribe"))));
  renderPage();
  expect(await screen.findByRole("heading", { name: "You're unsubscribed" })).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(axios.post).toHaveBeenCalledWith("/api/v1/alerts/unsubscribe", link);
  expect(screen.getByText("You won't get price-drop alerts from us any more.")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Undo: keep getting price-drop alerts" }));
  expect(await screen.findByRole("heading", { name: "You're subscribed again" })).toBeInTheDocument();
  expect(axios.post).toHaveBeenLastCalledWith("/api/v1/alerts/resubscribe", link);
  expect(screen.getByRole("link", { name: "your profile" })).toHaveAttribute("href", "/dashboard/user/profile");
});

test("an invalid link says so", async () => {
  axios.post.mockRejectedValue({ response: { status: 400, data: { message: "This link is invalid" } } });
  renderPage("u=u1&k=price_drop&t=forged");
  expect(await screen.findByRole("heading", { name: "We couldn't update your settings" })).toBeInTheDocument();
  expect(screen.getByText("This link is invalid")).toBeInTheDocument();
});
