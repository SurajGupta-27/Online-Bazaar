import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Layout from "./Layout";
import { AuthProvider } from "../../context/auth";
import { SearchProvider } from "../../context/search";
import { CartProvider } from "../../context/cart";

jest.mock("axios", () => ({
  get: jest.fn(() => Promise.resolve({ data: {} })),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const renderLayout = (props) =>
  render(
    <AuthProvider>
      <SearchProvider>
        <CartProvider>
          <MemoryRouter>
            <Layout {...props}>content</Layout>
          </MemoryRouter>
        </CartProvider>
      </SearchProvider>
    </AuthProvider>
  );

const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute("content");

test("pages without a title get the default title and meta tags", async () => {
  renderLayout({});
  await waitFor(() => expect(document.title).toBe("Ecommerce app - shop now"));
  expect(meta("description")).toBe("mern stack project");
});

test("a page's own title wins", async () => {
  renderLayout({ title: "Login - Ecommerce App" });
  await waitFor(() => expect(document.title).toBe("Login - Ecommerce App"));
});
