import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import toast from "react-hot-toast";
import ImagePicker, { appendImages, itemsFromImages, photoProblem } from "./ImagePicker";

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() },
}));

let nextUrl = 0;
beforeEach(() => {
  toast.error.mockClear();
  global.URL.createObjectURL = jest.fn(() => `blob:preview-${++nextUrl}`);
  global.URL.revokeObjectURL = jest.fn();
});

const image = (id) => ({ url: `https://res.cloudinary.com/demo/image/upload/v1/${id}.png`, publicId: id });
const png = (name, size = 10) => new File([new Uint8Array(size)], name, { type: "image/png" });

// Renders the picker with real state and exposes the latest items.
const setup = (initial = []) => {
  const latest = { items: initial };
  const Harness = () => {
    const [items, setItems] = useState(initial);
    latest.items = items;
    return <ImagePicker items={items} onChange={setItems} />;
  };
  render(<Harness />);
  return latest;
};
const pick = (...files) =>
  fireEvent.change(screen.getByLabelText(/photos \(/i), { target: { files } });

test("appendImages sends new files as photos and the full order as images", () => {
  const fd = new FormData();
  appendImages(fd, [
    { file: png("a.png"), preview: "x" },
    ...itemsFromImages([image("old1")]),
    { file: png("b.png"), preview: "y" },
  ]);
  expect(fd.getAll("photos").map((f) => f.name)).toEqual(["a.png", "b.png"]);
  expect(JSON.parse(fd.get("images"))).toEqual(["new:0", "old1", "new:1"]);
});

test("photoProblem enforces the server's type and size rules", () => {
  expect(photoProblem(png("ok.png"))).toBeNull();
  expect(photoProblem(png("big.png", 1_000_001))).toMatch(/less than 1MB/);
  expect(photoProblem(new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }))).toMatch(/JPEG, PNG/);
});

test("adding, reordering and removing photos", () => {
  const state = setup(itemsFromImages([image("old1"), image("old2")]));
  expect(screen.getByText("Main")).toBeInTheDocument();
  pick(png("new.png"), new File(["x"], "doc.pdf", { type: "application/pdf" }));
  expect(state.items).toHaveLength(3);
  expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/doc\.pdf/));

  fireEvent.click(screen.getByRole("button", { name: "Make new.png the main image" }));
  expect(state.items[0].file.name).toBe("new.png");
  fireEvent.click(screen.getByRole("button", { name: "Remove Photo 2" }));
  expect(state.items.map((i) => i.existing?.publicId || i.file.name)).toEqual(["new.png", "old2"]);
});

test("no more than 6 photos can be picked", () => {
  const state = setup(itemsFromImages([1, 2, 3, 4, 5].map((n) => image(`old${n}`))));
  pick(png("6.png"), png("7.png"));
  expect(state.items).toHaveLength(6);
  expect(toast.error).toHaveBeenCalledWith("A product can have at most 6 photos");
});

test("removed previews are released", () => {
  setup();
  pick(png("a.png"));
  fireEvent.click(screen.getByRole("button", { name: "Remove a.png" }));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(expect.stringMatching(/^blob:preview-/));
});
