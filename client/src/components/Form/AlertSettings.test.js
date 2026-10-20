import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import toast, { Toaster } from "react-hot-toast";
import axios from "axios";
import AlertSettings from "./AlertSettings";
import { AuthProvider } from "../../context/auth";
import { fakeToken } from "../../testUtils/fakeToken";

jest.mock("axios", () => ({
  get: jest.fn(),
  put: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const renderSettings = (alerts) => {
  localStorage.setItem("auth", JSON.stringify({ user: { _id: "u1", name: "Gia", role: 0, alerts }, token: fakeToken() }));
  render(
    <AuthProvider>
      <AlertSettings />
      <Toaster />
    </AuthProvider>
  );
};

afterEach(() => {
  localStorage.clear();
  act(() => toast.remove());
});

test("shows the settings from the API (an unsubscribe link may have changed them)", async () => {
  axios.get.mockResolvedValue({ data: { success: true, alerts: { priceDrop: false, backInStock: true } } });
  renderSettings({ priceDrop: true, backInStock: true });
  await waitFor(() => expect(screen.getByRole("switch", { name: "Price-drop alerts" })).not.toBeChecked());
  expect(axios.get).toHaveBeenCalledWith("/api/v1/alerts/preferences");
  expect(screen.getByRole("switch", { name: "Back-in-stock alerts" })).toBeChecked();
  expect(JSON.parse(localStorage.getItem("auth")).user.alerts.priceDrop).toBe(false);
});

test("a switch saves at once", async () => {
  axios.get.mockResolvedValue({ data: { success: true, alerts: { priceDrop: true, backInStock: true } } });
  axios.put.mockResolvedValue({ data: { success: true, message: "Alert settings saved", alerts: { priceDrop: true, backInStock: false } } });
  renderSettings();
  const restock = screen.getByRole("switch", { name: "Back-in-stock alerts" });
  await waitFor(() => expect(axios.get).toHaveBeenCalled());
  fireEvent.click(restock);
  expect(await screen.findByText("Alert settings saved")).toBeInTheDocument();
  expect(axios.put).toHaveBeenCalledWith("/api/v1/alerts/preferences", { backInStock: false });
  expect(restock).not.toBeChecked();
  expect(JSON.parse(localStorage.getItem("auth")).user.alerts).toEqual({ priceDrop: true, backInStock: false });
});

test("if saving fails the switch goes back", async () => {
  axios.get.mockResolvedValue({ data: { success: true, alerts: { priceDrop: true, backInStock: true } } });
  axios.put.mockRejectedValue({ response: { status: 500, data: { message: "Unable to save your alert settings" } } });
  renderSettings();
  await waitFor(() => expect(axios.get).toHaveBeenCalled());
  const drop = screen.getByRole("switch", { name: "Price-drop alerts" });
  fireEvent.click(drop);
  expect(await screen.findByText("Unable to save your alert settings")).toBeInTheDocument();
  expect(drop).toBeChecked();
});
