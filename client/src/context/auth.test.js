import { render, screen, act } from "@testing-library/react";
import axios from "axios";
import { AuthProvider, useAuth } from "./auth";
import { fakeToken } from "../testUtils/fakeToken";

jest.mock("axios", () => ({
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(() => 1), eject: jest.fn() } },
}));
jest.mock("react-hot-toast", () => ({ __esModule: true, default: { error: jest.fn() } }));

const Who = () => {
  const [auth] = useAuth();
  return <div>{auth.user ? `Signed in as ${auth.user.name}` : "Signed out"}</div>;
};
const store = (token) =>
  localStorage.setItem("auth", JSON.stringify({ user: { name: "Sam" }, token }));
const renderAuth = () =>
  render(
    <AuthProvider>
      <Who />
    </AuthProvider>
  );
// The rejection handler AuthProvider registered with axios.
const onError = () => axios.interceptors.response.use.mock.calls.at(-1)[1];
const apiError = (status, url, token) => ({
  response: { status },
  config: { url, headers: { Authorization: token } },
});

afterEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

test("an expired token in storage is discarded on load", () => {
  store(fakeToken(-60));
  renderAuth();
  expect(screen.getByText("Signed out")).toBeInTheDocument();
  expect(localStorage.getItem("auth")).toBeNull();
});

test("a valid token in storage signs the user in", () => {
  store(fakeToken(3600));
  renderAuth();
  expect(screen.getByText("Signed in as Sam")).toBeInTheDocument();
});

test("a 401 on an authenticated request signs the user out", async () => {
  const token = fakeToken(3600);
  store(token);
  renderAuth();
  await act(async () => {
    await expect(onError()(apiError(401, "/api/v1/order/my-orders", token))).rejects.toBeTruthy();
  });
  expect(screen.getByText("Signed out")).toBeInTheDocument();
  expect(localStorage.getItem("auth")).toBeNull();
});

test("wrong-password 401s and non-admin 403s keep the user signed in", async () => {
  const token = fakeToken(3600);
  store(token);
  renderAuth();
  await act(async () => {
    await expect(onError()(apiError(401, "/api/v1/auth/login", token))).rejects.toBeTruthy();
    await expect(onError()(apiError(403, "/api/v1/auth/admin-auth", token))).rejects.toBeTruthy();
  });
  expect(screen.getByText("Signed in as Sam")).toBeInTheDocument();
  expect(localStorage.getItem("auth")).not.toBeNull();
});
