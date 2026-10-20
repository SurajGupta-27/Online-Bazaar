import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import Reviews from "./Reviews";
import { AuthProvider } from "../../context/auth";
import { SearchProvider } from "../../context/search";
import { CartProvider } from "../../context/cart";

jest.mock("axios", () => ({
  get: jest.fn(),
  delete: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const page = (n, reviews) => ({
  data: { success: true, reviews, page: n, pages: 2, total: 21 },
});
const review = (id, name, comment) => ({
  _id: id, name, email: `${name.toLowerCase()}@x.com`, rating: 1, comment, verified: true,
  createdAt: "2026-10-01T10:00:00Z", product: { _id: "p1", name: "Pen", slug: "pen" },
});

test("lists reviews with product and customer, pages through them, and deletes one", async () => {
  axios.get.mockImplementation((url) => {
    if (url === "/api/v1/review/all?page=1") return Promise.resolve(page(1, [review("r1", "Spam", "Buy cheap watches here!!")]));
    if (url === "/api/v1/review/all?page=2") return Promise.resolve(page(2, [review("r2", "Asha", "Lovely pen, writes well.")]));
    return Promise.resolve({ data: {} });
  });
  axios.delete.mockResolvedValue({ data: { success: true } });
  window.confirm = jest.fn(() => true);
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter>
            <Reviews />
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );

  const row = (await screen.findByText("Buy cheap watches here!!")).closest("tr");
  expect(within(row).getByRole("link", { name: "Pen" })).toHaveAttribute("href", "/product/pen");
  expect(within(row).getByText("spam@x.com")).toBeInTheDocument();
  expect(screen.getByText("21 in total, newest first")).toBeInTheDocument();

  fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
  expect(window.confirm).toHaveBeenCalledWith("Delete Spam's review of Pen?");
  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith("/api/v1/review/r1"));

  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByText("Lovely pen, writes well.")).toBeInTheDocument();
  expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
});
