import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import CreateCategory from "./CreateCategory";
import { AuthProvider } from "../../context/auth";
import { SearchProvider } from "../../context/search";
import { CartProvider } from "../../context/cart";
import { watchKeyWarnings } from "../../testUtils/keyWarnings";

jest.mock("axios", () => ({
  get: jest.fn(),
  put: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const renderPage = () => {
  axios.get.mockResolvedValue({
    data: { success: true, category: [{ _id: "c1", name: "Books" }, { _id: "c2", name: "Toys" }] },
  });
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter>
            <CreateCategory />
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );
};

test("category rows render without key warnings", async () => {
  const keys = watchKeyWarnings();
  renderPage();
  expect(await screen.findByRole("cell", { name: "Toys" })).toBeInTheDocument();
  keys.restore();
  expect(keys.warnings).toEqual([]);
});

test("Edit opens the popup with the name and saves the rename", async () => {
  axios.put.mockResolvedValue({ data: { success: true } });
  renderPage();
  await screen.findByRole("cell", { name: "Toys" });
  // Rows are Books, Toys: the second Edit button belongs to Toys.
  fireEvent.click(screen.getAllByText("Edit")[1]);

  const dialog = await screen.findByRole("dialog");
  const input = within(dialog).getByPlaceholderText("Enter new category");
  expect(input).toHaveValue("Toys");
  fireEvent.change(input, { target: { value: "Games" } });
  fireEvent.click(within(dialog).getByText("Submit"));

  await waitFor(() =>
    expect(axios.put).toHaveBeenCalledWith("/api/v1/category/update-category/c2", { name: "Games" })
  );
});
