import { productImage, productImages, sizedImage } from "./productImage";

const cloud = (id) => `https://res.cloudinary.com/demo/image/upload/v1/online-bazaar/products/${id}.png`;

test("Cloudinary URLs get auto format/quality and an optional width", () => {
  expect(sizedImage(cloud("a"), 400)).toBe(
    "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_400/v1/online-bazaar/products/a.png"
  );
  expect(sizedImage(cloud("a"))).toBe(
    "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/online-bazaar/products/a.png"
  );
});

test("other URLs are left alone", () => {
  expect(sizedImage("/api/v1/product/product-photo/p1", 400)).toBe("/api/v1/product/product-photo/p1");
  expect(sizedImage("https://example.com/image/upload/x.png", 400)).toBe("https://example.com/image/upload/x.png");
});

test("the first Cloudinary image is the main image", () => {
  const product = { _id: "p1", images: [{ url: cloud("main") }, { url: cloud("second") }] };
  expect(productImage(product)).toContain("/main.png");
  expect(productImages(product)).toHaveLength(2);
});

test("products without images fall back to the photo endpoint", () => {
  expect(productImage({ _id: "p1", images: [] })).toBe("/api/v1/product/product-photo/p1");
  expect(productImage({ _id: "p1" })).toBe("/api/v1/product/product-photo/p1");
  expect(productImages({})).toEqual([]);
  expect(productImage(undefined)).toBe("");
});
