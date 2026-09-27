import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import AdminRoute from "./AdminRoute";
import PrivateRoute from "./Private";
import { AuthProvider } from "../../context/auth";
import { fakeToken } from "../../testUtils/fakeToken";

jest.mock("axios", () => ({
  get: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const unhandled = [];
const onUnhandled = (reason) => unhandled.push(reason);
beforeAll(() => process.on("unhandledRejection", onUnhandled));
afterAll(() => process.off("unhandledRejection", onUnhandled));

beforeEach(() => {
  unhandled.length = 0;
  jest.useFakeTimers();
  localStorage.setItem(
    "auth",
    JSON.stringify({ user: { name: "Sam", role: 0 }, token: fakeToken() })
  );
});
afterEach(() => {
  jest.useRealTimers();
  localStorage.clear();
});

const renderAt = (path) =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<div>Home page</div>} />
          <Route path="/login" element={<div>Login page</div>} />
          <Route path="/dashboard" element={<PrivateRoute />}>
            <Route path="user" element={<div>User area</div>} />
          </Route>
          <Route path="/dashboard" element={<AdminRoute />}>
            <Route path="admin" element={<div>Admin area</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );

const rejectWith = (status) =>
  axios.get.mockRejectedValue(Object.assign(new Error(`HTTP ${status}`), { response: { status } }));

const waitSeconds = async (n) => {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  }
};

test("non-admin opening an admin page is redirected home without a crash", async () => {
  rejectWith(403);
  renderAt("/dashboard/admin");
  expect(await screen.findByText(/redirecting/i)).toBeInTheDocument();
  await waitSeconds(3);
  expect(screen.getByText("Home page")).toBeInTheDocument();
  expect(screen.queryByText("Admin area")).toBeNull();
  expect(unhandled).toHaveLength(0);
});

test("rejected user check redirects to login without a crash", async () => {
  rejectWith(401);
  renderAt("/dashboard/user");
  await waitSeconds(3);
  expect(screen.getByText("Login page")).toBeInTheDocument();
  expect(unhandled).toHaveLength(0);
});

test("successful check renders the protected page", async () => {
  axios.get.mockResolvedValue({ data: { ok: true } });
  renderAt("/dashboard/admin");
  expect(await screen.findByText("Admin area")).toBeInTheDocument();
});
