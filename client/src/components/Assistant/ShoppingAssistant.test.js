import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import ShoppingAssistant, { MAX_MESSAGE_LENGTH, modeLabel } from "./ShoppingAssistant";

jest.mock("axios", () => ({
  post: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const phone = {
  _id: "p1",
  name: "Galaxy A15",
  slug: "galaxy-a15",
  price: 14999,
  quantity: 5,
  images: [],
  ratingAverage: 4.6,
  ratingCount: 20,
  reason: "Great battery for the price.",
};
const answer = (data) => Promise.resolve({ data: { success: true, reply: "Here you go.", products: [phone], mode: "ai", provider: "Gemini", fallback: null, context: { filters: { maxPrice: 20000 }, productIds: ["p1"] }, ...data } });

const renderAssistant = () =>
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<ShoppingAssistant />} />
        <Route path="/product/:slug" element={<><div>Product page</div><ShoppingAssistant /></>} />
      </Routes>
    </MemoryRouter>
  );
const ask = (text) => {
  fireEvent.change(screen.getByLabelText("Ask Bazaar AI"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
};

afterEach(() => {
  sessionStorage.clear();
  jest.clearAllMocks();
});

test("the floating button opens the chat with the AI notice", () => {
  renderAssistant();
  fireEvent.click(screen.getByRole("button", { name: /Ask Bazaar AI/ }));
  expect(screen.getByRole("dialog", { name: /Bazaar AI/ })).toBeInTheDocument();
  expect(screen.getByText(/Answers are AI-generated/)).toBeInTheDocument();
  expect(screen.getByLabelText("Ask Bazaar AI")).toHaveAttribute("maxLength", String(MAX_MESSAGE_LENGTH));
});

test("an answer shows product cards with reasons, price and the mode label", async () => {
  axios.post.mockImplementation(() => answer());
  renderAssistant();
  fireEvent.click(screen.getByRole("button", { name: /Ask Bazaar AI/ }));
  ask("best rated phone under 20000");

  expect(await screen.findByText("Here you go.")).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledWith("/api/v1/assistant/chat", { message: "best rated phone under 20000", history: [], context: null });
  const card = screen.getByRole("link", { name: /Galaxy A15/ });
  expect(card).toHaveAttribute("href", "/product/galaxy-a15");
  expect(card).toHaveTextContent("₹14,999");
  expect(card).toHaveTextContent("Great battery for the price.");
  expect(screen.getByText("AI · Gemini")).toBeInTheDocument();
});

test("follow-ups send the previous context and recent turns", async () => {
  axios.post.mockImplementation(() => answer());
  renderAssistant();
  fireEvent.click(screen.getByRole("button", { name: /Ask Bazaar AI/ }));
  ask("phone under 20000");
  await screen.findByText("Here you go.");

  axios.post.mockImplementation(() => answer({ mode: "smart_search", provider: null, fallback: "limit", reply: "Cheaper picks." }));
  fireEvent.click(screen.getByRole("button", { name: "Show cheaper ones" }));
  expect(await screen.findByText("Cheaper picks.")).toBeInTheDocument();
  expect(axios.post).toHaveBeenLastCalledWith("/api/v1/assistant/chat", {
    message: "Show cheaper ones",
    history: [
      { role: "user", text: "phone under 20000" },
      { role: "assistant", text: "Here you go." },
    ],
    context: { filters: { maxPrice: 20000 }, productIds: ["p1"] },
  });
  expect(screen.getByText("Smart search")).toHaveAttribute("title", "AI is busy right now");
});

test("errors from the API are shown in the chat", async () => {
  axios.post.mockRejectedValue({ response: { status: 429, data: { message: "You're sending messages too quickly." } } });
  renderAssistant();
  fireEvent.click(screen.getByRole("button", { name: /Ask Bazaar AI/ }));
  ask("phone");
  expect(await screen.findByRole("alert")).toHaveTextContent("too quickly");
});

test("opening a product closes the panel and keeps the chat for later", async () => {
  axios.post.mockImplementation(() => answer());
  renderAssistant();
  fireEvent.click(screen.getByRole("button", { name: /Ask Bazaar AI/ }));
  ask("phone");
  fireEvent.click(await screen.findByRole("link", { name: /Galaxy A15/ }));

  expect(await screen.findByText("Product page")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Ask Bazaar AI/ }));
  expect(screen.getByText("Here you go.")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "New chat" }));
  await waitFor(() => expect(screen.queryByText("Here you go.")).toBeNull());
});

test("mode labels", () => {
  expect(modeLabel({ mode: "ai", provider: "Groq" }).text).toBe("AI · Groq");
  expect(modeLabel({ mode: "smart_search", fallback: "off" })).toEqual({ text: "Smart search", title: "AI is switched off" });
});
