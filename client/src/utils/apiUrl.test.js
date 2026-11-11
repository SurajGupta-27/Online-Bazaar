// REACT_APP_API_URL is read when the module loads, so each case loads it fresh.
const load = (value) => {
  jest.resetModules();
  if (value === undefined) delete process.env.REACT_APP_API_URL;
  else process.env.REACT_APP_API_URL = value;
  return { ...require("./apiUrl"), ...require("./productImage") };
};

afterEach(() => delete process.env.REACT_APP_API_URL);

test("without REACT_APP_API_URL, API paths stay relative (same origin)", () => {
  const { API_BASE, apiUrl, productImage } = load(undefined);
  expect(API_BASE).toBe("");
  expect(apiUrl("/api/v1/x")).toBe("/api/v1/x");
  expect(productImage({ _id: "p1" })).toBe("/api/v1/product/product-photo/p1");
});

test("with REACT_APP_API_URL, API paths point at the API host (trailing slash ignored)", () => {
  const { API_BASE, apiUrl, productImage } = load(" https://bazaar-api.onrender.com/ ");
  expect(API_BASE).toBe("https://bazaar-api.onrender.com");
  expect(apiUrl("/api/v1/x")).toBe("https://bazaar-api.onrender.com/api/v1/x");
  expect(productImage({ _id: "p1" })).toBe("https://bazaar-api.onrender.com/api/v1/product/product-photo/p1");
  // Cloudinary images are already absolute and never go through the API.
  const cloud = "https://res.cloudinary.com/demo/image/upload/v1/a.png";
  expect(productImage({ _id: "p1", images: [{ url: cloud }] })).toContain("res.cloudinary.com");
});
