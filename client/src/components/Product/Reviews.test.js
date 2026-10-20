import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import axios from "axios";
import Reviews from "./Reviews";
import { AuthProvider } from "../../context/auth";
import { fakeToken } from "../../testUtils/fakeToken";

jest.mock("axios", () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const review = (id, name, rating, extra) => ({
  _id: id, name, rating, comment: `${name} says this is a fine product.`, verified: true,
  createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", edited: false, ...extra,
});
const summary = { average: 4.5, count: 2, breakdown: { 5: 1, 4: 1, 3: 0, 2: 0, 1: 0 } };

// API answers: the product's reviews, and "mine" for the signed-in user.
const mockApi = ({ reviews = [review("r1", "Asha", 5), review("r2", "Ravi", 4)], mine = { canReview: false, review: null } } = {}) => {
  axios.get.mockImplementation((url) => {
    if (url === "/api/v1/review/product/p1") {
      return Promise.resolve({ data: { success: true, summary, reviews, page: 1, pages: 1 } });
    }
    if (url === "/api/v1/review/product/p1/mine") return Promise.resolve({ data: { success: true, ...mine } });
    return Promise.resolve({ data: {} });
  });
};

const signIn = (user = { _id: "u1", name: "Gia", role: 0 }) =>
  localStorage.setItem("auth", JSON.stringify({ user, token: fakeToken() }));

const onSummary = jest.fn();
const renderReviews = () =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/product/pen"]}>
        <Reviews productId="p1" onSummary={onSummary} />
        <Toaster />
      </MemoryRouter>
    </AuthProvider>
  );

afterEach(() => localStorage.clear());

test("anyone sees the average, breakdown and reviews with Verified Purchase badges", async () => {
  mockApi();
  renderReviews();
  expect(await screen.findByText("Asha says this is a fine product.")).toBeInTheDocument();
  expect(screen.getByText("4.5", { selector: ".reviews-average" })).toBeInTheDocument();
  expect(screen.getByText("(2 reviews)")).toBeInTheDocument();
  expect(screen.getAllByText("Verified Purchase")).toHaveLength(2);
  expect(screen.getByRole("progressbar", { name: "5 star reviews" })).toHaveAttribute("aria-valuenow", "50");
  expect(screen.getByRole("progressbar", { name: "3 star reviews" })).toHaveAttribute("aria-valuenow", "0");
  expect(onSummary).toHaveBeenCalledWith(summary);
  // Logged out: a prompt to log in, no form, no delete buttons.
  expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  expect(screen.queryByRole("button", { name: "Submit review" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
});

test("a signed-in customer who hasn't received the product can't review it", async () => {
  signIn();
  mockApi();
  renderReviews();
  expect(await screen.findByText(/Only customers who have received this product/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Submit review" })).toBeNull();
});

test("a verified buyer writes a review: rating and length are checked first", async () => {
  signIn();
  mockApi({ mine: { canReview: true, review: null } });
  axios.post.mockResolvedValue({ data: { success: true, message: "Thanks for your review!" } });
  renderReviews();

  const submit = await screen.findByRole("button", { name: "Submit review" });
  fireEvent.click(submit);
  expect(await screen.findByText("Choose a rating from 1 to 5 stars")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("4 stars"));
  fireEvent.change(screen.getByLabelText("Your review"), { target: { value: "Too short" } });
  fireEvent.click(submit);
  expect(await screen.findByText("Write at least 10 characters")).toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Your review"), { target: { value: "Writes smoothly, good grip." } });
  expect(screen.getByText("27/1000 characters (at least 10)")).toBeInTheDocument();
  fireEvent.click(submit);
  await waitFor(() =>
    expect(axios.post).toHaveBeenCalledWith("/api/v1/review/product/p1", {
      rating: 4,
      comment: "Writes smoothly, good grip.",
    })
  );
  expect(await screen.findByText("Thanks for your review!")).toBeInTheDocument();
});

test("the API's refusal is shown", async () => {
  signIn();
  mockApi({ mine: { canReview: true, review: null } });
  axios.post.mockRejectedValue({ response: { status: 429, data: { message: "You're posting reviews too quickly. Please try again later." } } });
  renderReviews();
  fireEvent.click(await screen.findByLabelText("5 stars"));
  fireEvent.change(screen.getByLabelText("Your review"), { target: { value: "Excellent pen, recommended." } });
  fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
  expect(await screen.findByText(/posting reviews too quickly/)).toBeInTheDocument();
});

test("the author sees their review on its own and can edit or delete it", async () => {
  signIn();
  const own = review("r2", "Gia", 4, { edited: true });
  mockApi({ reviews: [review("r1", "Asha", 5), own], mine: { canReview: true, review: own } });
  axios.put.mockResolvedValue({ data: { success: true, message: "Review updated" } });
  axios.delete.mockResolvedValue({ data: { success: true } });
  window.confirm = jest.fn(() => true);
  renderReviews();

  const mine = (await screen.findByText("Your review")).closest("li");
  expect(within(mine).getByText(/\(edited\)/)).toBeInTheDocument();
  expect(screen.getAllByText("Gia says this is a fine product.")).toHaveLength(1); // not listed twice

  fireEvent.click(within(mine).getByRole("button", { name: "Edit" }));
  expect(screen.getByLabelText("Your review")).toHaveValue("Gia says this is a fine product.");
  fireEvent.click(screen.getByLabelText("2 stars"));
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(axios.put).toHaveBeenCalledWith("/api/v1/review/r2", {
      rating: 2,
      comment: "Gia says this is a fine product.",
    })
  );

  // Saving closes the form and shows the review again.
  await waitFor(() => expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull());
  const again = screen.getByText("Your review", { selector: ".badge" }).closest("li");
  fireEvent.click(within(again).getByRole("button", { name: "Delete" }));
  expect(window.confirm).toHaveBeenCalledWith("Delete your review?");
  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith("/api/v1/review/r2"));
  // Others' reviews have no Delete button for a customer.
  const asha = screen.getByText("Asha says this is a fine product.").closest("li");
  expect(within(asha).queryByRole("button", { name: "Delete" })).toBeNull();
});

test("an admin can delete anyone's review", async () => {
  signIn({ _id: "a1", name: "Admin", role: 1 });
  mockApi();
  axios.delete.mockResolvedValue({ data: { success: true } });
  window.confirm = jest.fn(() => true);
  renderReviews();
  const ravi = (await screen.findByText("Ravi says this is a fine product.")).closest("li");
  fireEvent.click(within(ravi).getByRole("button", { name: "Delete" }));
  expect(window.confirm).toHaveBeenCalledWith("Delete Ravi's review?");
  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith("/api/v1/review/r2"));
});
