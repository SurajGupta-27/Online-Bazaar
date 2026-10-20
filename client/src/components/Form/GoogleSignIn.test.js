import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import { Toaster } from "react-hot-toast";
import Login from "../../pages/Auth/Login";
import Register from "../../pages/Auth/Register";
import { AuthProvider } from "../../context/auth";
import { SearchProvider } from "../../context/search";
import { CartProvider } from "../../context/cart";

jest.mock("axios", () => ({
  get: jest.fn(),
  post: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

// Stands in for Google's button: clicking it "signs in" and hands back an ID
// token, the only thing Google gives the page.
jest.mock("@react-oauth/google", () => ({
  GoogleOAuthProvider: ({ clientId, children }) => (
    <div data-testid="google-provider" data-client-id={clientId}>{children}</div>
  ),
  GoogleLogin: ({ onSuccess, onError, text }) => (
    <>
      <button type="button" onClick={() => onSuccess({ credential: "google-id-token" })}>
        Google: {text}
      </button>
      <button type="button" onClick={() => onError()}>Google popup closed</button>
    </>
  ),
}));

const CLIENT_ID = "test-client.apps.googleusercontent.com";

const renderAt = (element, state) =>
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter initialEntries={[{ pathname: "/page", state }]}>
            <Routes>
              <Route path="/page" element={element} />
              {/* Real pages show toasts through Layout's <Toaster />. */}
              <Route path="/" element={<div>Home page<Toaster /></div>} />
              <Route path="/cart" element={<div>Cart page<Toaster /></div>} />
            </Routes>
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );

const googleUser = (extra) => ({
  _id: "u1", name: "Gia", email: "gia@gmail.com", role: 0, hasPassword: false, googleLinked: true, ...extra,
});

beforeEach(() => {
  process.env.REACT_APP_GOOGLE_CLIENT_ID = CLIENT_ID;
  axios.get.mockResolvedValue({ data: { success: true, category: [] } });
});
afterEach(() => {
  delete process.env.REACT_APP_GOOGLE_CLIENT_ID;
  localStorage.clear();
});

test("without a client ID there is no Google button", async () => {
  delete process.env.REACT_APP_GOOGLE_CLIENT_ID;
  renderAt(<Login />);
  expect(await screen.findByRole("button", { name: "LOGIN" })).toBeInTheDocument();
  expect(screen.queryByText(/Google:/)).not.toBeInTheDocument();
});

test("login page: only Google's credential is sent, then the user is signed in", async () => {
  const user = googleUser({ phone: "98765", address: "1 MG Road" });
  axios.post.mockResolvedValue({ data: { success: true, message: "Login successfully", user, token: "jwt" } });
  renderAt(<Login />, "/cart");

  expect(screen.getByTestId("google-provider")).toHaveAttribute("data-client-id", CLIENT_ID);
  fireEvent.click(screen.getByRole("button", { name: "Google: continue_with" }));

  expect(await screen.findByText("Cart page")).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledWith("/api/v1/auth/google", { credential: "google-id-token" });
  const saved = JSON.parse(localStorage.getItem("auth"));
  expect(saved.user).toEqual(user);
  expect(saved.token).toBe("jwt");
});

test("register page: a new Google account is reminded to add a phone and address", async () => {
  axios.post.mockResolvedValue({
    data: { success: true, message: "Account created with Google", user: googleUser(), token: "jwt" },
  });
  renderAt(<Register />);
  fireEvent.click(screen.getByRole("button", { name: "Google: signup_with" }));

  expect(await screen.findByText("Home page")).toBeInTheDocument();
  expect(await screen.findByText(/Add your phone number and address in your profile/)).toBeInTheDocument();
});

test("a rejected sign-in shows the API's message and signs no one in", async () => {
  axios.post.mockRejectedValue({
    response: { status: 409, data: { message: "This email is linked to a different Google account. Log in with your password." } },
  });
  renderAt(<Login />);
  fireEvent.click(screen.getByRole("button", { name: "Google: continue_with" }));

  expect(await screen.findByText(/linked to a different Google account/)).toBeInTheDocument();
  expect(localStorage.getItem("auth")).toBeNull();
  expect(screen.queryByText("Home page")).not.toBeInTheDocument();
});

test("closing Google's popup shows a message and calls no API", async () => {
  renderAt(<Login />);
  fireEvent.click(screen.getByRole("button", { name: "Google popup closed" }));
  expect(await screen.findByText(/Google sign-in was cancelled/)).toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();
});
