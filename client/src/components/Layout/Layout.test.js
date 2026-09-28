import { render, screen, waitFor } from "@testing-library/react";
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

// <meta> tags live in <head>, which Testing Library queries don't cover.
// eslint-disable-next-line testing-library/no-node-access
const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute("content");

test("pages without a title get the store's default title and meta tags", async () => {
  renderLayout({});
  await waitFor(() =>
    expect(document.title).toBe("Online Bazaar | Everything you need, delivered to your door")
  );
  expect(meta("description")).toMatch(/^Online Bazaar: /);
  expect(meta("author")).toBe("Suraj Gupta");
});

test("a page's own title is followed by the store name", async () => {
  renderLayout({ title: "Login" });
  await waitFor(() => expect(document.title).toBe("Login | Online Bazaar"));
});

test("header and footer show the Online Bazaar brand and owner", () => {
  renderLayout({});
  expect(screen.getByRole("link", { name: /Online Bazaar/ })).toHaveAttribute("href", "/");
  expect(screen.getByText(/Built by Suraj Gupta/)).toBeInTheDocument();
  expect(screen.queryByText(/Techinfoyt|Ecommerce App/i)).toBeNull();
});
