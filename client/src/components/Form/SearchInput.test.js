import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import SearchInput from "./SearchInput";
import { SearchProvider } from "../../context/search";

jest.mock("axios", () => ({ get: jest.fn() }));

const renderSearch = () =>
  render(
    <SearchProvider>
      <MemoryRouter>
        <SearchInput />
      </MemoryRouter>
    </SearchProvider>
  );

const search = (text) => {
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: text } });
  fireEvent.click(screen.getByText("Search"));
};

beforeEach(() => axios.get.mockReset().mockResolvedValue({ data: [] }));

test.each(["", "   "])("blank search %j sends no request", async (text) => {
  renderSearch();
  search(text);
  await new Promise((r) => setTimeout(r, 0));
  expect(axios.get).not.toHaveBeenCalled();
});

test("keyword is trimmed and URL-encoded", async () => {
  renderSearch();
  search("  c++ / 50% #1 ");
  await waitFor(() =>
    expect(axios.get).toHaveBeenCalledWith("/api/v1/product/search/c%2B%2B%20%2F%2050%25%20%231")
  );
});
