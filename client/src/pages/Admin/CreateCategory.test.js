import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import CreateCategory from "./CreateCategory";
import { AuthProvider } from "../../context/auth";
import { SearchProvider } from "../../context/search";
import { CartProvider } from "../../context/cart";
import { watchKeyWarnings } from "../../testUtils/keyWarnings";

jest.mock("axios", () => ({
  get: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

test("category rows render without key warnings", async () => {
  const keys = watchKeyWarnings();
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
  expect(await screen.findByRole("cell", { name: "Toys" })).toBeInTheDocument();
  keys.restore();
  expect(keys.warnings).toEqual([]);
});
