import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import axios from "axios";
import NotifyMeButton from "./NotifyMeButton";
import ProductCard from "./ProductCard";
import { AuthProvider } from "../../context/auth";
import { CartProvider } from "../../context/cart";
import { AlertsProvider } from "../../context/alerts";
import { fakeToken } from "../../testUtils/fakeToken";

jest.mock("axios", () => ({
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const fan = { _id: "p1", name: "Fan", slug: "fan", description: "A fan", price: 500, quantity: 0 };
const LoginStub = () => <div>Login page, back to {useLocation().state}</div>;

const renderAt = (element) =>
  render(
    <AuthProvider>
      <CartProvider>
        <AlertsProvider>
          <MemoryRouter initialEntries={["/product/fan"]}>
            <Routes>
              <Route path="/product/fan" element={element} />
              <Route path="/login" element={<LoginStub />} />
            </Routes>
            <Toaster />
          </MemoryRouter>
        </AlertsProvider>
      </CartProvider>
    </AuthProvider>
  );

const signIn = (alerts) =>
  localStorage.setItem("auth", JSON.stringify({ user: { _id: "u1", name: "Gia", role: 0, alerts }, token: fakeToken() }));
const waitingFor = (products) =>
  axios.get.mockImplementation((url) =>
    Promise.resolve({ data: url === "/api/v1/alerts/restock" ? { success: true, products } : {} })
  );

beforeEach(() => waitingFor([]));
afterEach(() => {
  localStorage.clear();
  act(() => toast.remove());
});

test("logged out: asks to log in and comes back here afterwards", async () => {
  renderAt(<NotifyMeButton product={fan} />);
  fireEvent.click(screen.getByRole("button", { name: "Notify me when available" }));
  expect(await screen.findByText("Login page, back to /product/fan")).toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();
  expect(axios.get).not.toHaveBeenCalledWith("/api/v1/alerts/restock");
});

test("signed in: asking turns alerts on, and they can be cancelled", async () => {
  signIn();
  axios.post.mockResolvedValue({ data: { success: true } });
  axios.delete.mockResolvedValue({ data: { success: true } });
  renderAt(<NotifyMeButton product={fan} />);
  await waitFor(() => expect(axios.get).toHaveBeenCalledWith("/api/v1/alerts/restock"));

  fireEvent.click(screen.getByRole("button", { name: "Notify me when available" }));
  expect(await screen.findByText("We'll email you when it's back in stock")).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledWith("/api/v1/alerts/restock/p1");
  expect(screen.getByText("Alerts on")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Cancel alert" }));
  expect(await screen.findByText("Alert cancelled")).toBeInTheDocument();
  expect(axios.delete).toHaveBeenCalledWith("/api/v1/alerts/restock/p1");
  expect(screen.getByRole("button", { name: "Notify me when available" })).toBeInTheDocument();
});

test("an existing request shows Alerts on when the page loads", async () => {
  signIn();
  waitingFor(["p1"]);
  renderAt(<NotifyMeButton product={fan} />);
  expect(await screen.findByText("Alerts on")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Notify me when available" })).toBeNull();
});

test("if the request fails it goes back and the error is shown", async () => {
  signIn();
  axios.post.mockRejectedValue({ response: { status: 400, data: { message: "This product is in stock" } } });
  renderAt(<NotifyMeButton product={fan} />);
  await waitFor(() => expect(axios.get).toHaveBeenCalledWith("/api/v1/alerts/restock"));
  fireEvent.click(screen.getByRole("button", { name: "Notify me when available" }));
  expect(await screen.findByText("This product is in stock")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Notify me when available" })).toBeInTheDocument();
  expect(screen.queryByText("Alerts on")).toBeNull();
});

test("says so when back-in-stock emails are turned off", async () => {
  signIn({ priceDrop: true, backInStock: false });
  renderAt(<NotifyMeButton product={fan} />);
  expect(await screen.findByText(/Back-in-stock emails are turned off/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Turn them on in your profile" })).toHaveAttribute("href", "/dashboard/user/profile");
});

test("product cards show Alerts on for products the user is waiting for", async () => {
  signIn();
  waitingFor(["p1"]);
  renderAt(<ProductCard product={fan} />);
  expect(await screen.findByText("Alerts on")).toBeInTheDocument();
});

test("product cards show nothing for other products", async () => {
  signIn();
  renderAt(<ProductCard product={fan} />);
  await waitFor(() => expect(axios.get).toHaveBeenCalledWith("/api/v1/alerts/restock"));
  expect(screen.queryByText("Alerts on")).toBeNull();
});
