import { withServer, check, ObjectId } from "./harness.mjs";
import { adminSetup, PNG, productForm } from "./fixtures.mjs";

const form = (fields) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) fd.append(k, v);
  return fd;
};

await withServer(async ({ api, db }) => {
  const { token, categoryId } = await adminSetup(api, db);
  const base = { name: "Pen", description: "Blue pen", price: "2.5", quantity: "10", category: categoryId, shipping: "1" };
  const create = (fields) => api("POST", "/api/v1/product/create-product", form(fields), { token });

  // #10: validation errors are 400 with a readable message
  const cases = [
    [{ ...base, name: "" }, "Name is required"],
    [{ ...base, description: "  " }, "Description is required"],
    [{ ...base, price: "abc" }, "Price must be a number of 0 or more"],
    [{ ...base, price: "-1" }, "Price must be a number of 0 or more"],
    [{ ...base, quantity: "1.5" }, "Quantity must be a whole number of 0 or more"],
    [{ ...base, category: undefined }, "Category is required"],
    [{ ...base, category: "nope" }, "Selected category does not exist"],
    [{ ...base, category: String(new ObjectId()) }, "Selected category does not exist"],
  ];
  for (const [fields, message] of cases) {
    const r = await create(fields);
    check(`create -> 400 "${message}"`, r.status === 400 && r.json?.message === message, `${r.status} ${r.text}`);
  }
  check("no invalid products saved", (await db.collection("products").countDocuments()) === 0);

  const zero = await create({ ...base, quantity: "0" });
  check("quantity 0 (out of stock) is allowed", zero.status === 201, zero.text.slice(0, 150));
  const extra = await create({ ...base, name: "Pencil", slug: "hijacked", photo: "x" });
  const saved = await db.collection("products").findOne({ name: "Pencil" });
  check("unknown/protected fields are ignored", extra.status === 201 && saved.slug !== "hijacked", saved?.slug);
  check("numbers and shipping stored with correct types", saved.price === 2.5 && saved.quantity === 10 && saved.shipping === true);

  const upd = await api("PUT", `/api/v1/product/update-product/${saved._id}`, form({ ...base, price: "" }), { token });
  check("update validation -> 400 with message", upd.status === 400 && upd.json.message === "Price must be a number of 0 or more", upd.text);

  // #10: category validation
  const blank = await api("POST", "/api/v1/category/create-category", { name: "  " }, { token });
  check("blank category name -> 400", blank.status === 400 && blank.json.message === "Name is required", blank.text);
  const dup = await api("POST", "/api/v1/category/create-category", { name: "Books" }, { token });
  check("duplicate category -> 409", dup.status === 409 && dup.json.message === "Category already exists", dup.text);

  // Signed-in non-admins get 403 (not 401, which the client treats as an expired session)
  await api("POST", "/api/v1/auth/register", { name: "U", email: "u@x.com", password: "secret1", phone: "1", address: "a", answer: "a" });
  const user = await api("POST", "/api/v1/auth/login", { email: "u@x.com", password: "secret1" });
  const denied = await api("POST", "/api/v1/category/create-category", { name: "Toys" }, { token: user.json.token });
  const adminCheck = await api("GET", "/api/v1/auth/admin-auth", null, { token: user.json.token });
  check("non-admin gets 403 on admin routes", denied.status === 403 && adminCheck.status === 403, `${denied.status} ${adminCheck.status}`);
  const expired = await api("GET", "/api/v1/auth/user-auth", null, { token: "garbage" });
  check("invalid token still gets 401", expired.status === 401);
});

// #12: update endpoints handle missing/invalid data without crashing
await withServer(async ({ api, db }) => {
  const { token, categoryId } = await adminSetup(api, db);
  const base = { name: "Pen", description: "Blue pen", price: "2", quantity: "1", category: categoryId };
  const missing = String(new ObjectId());
  const up = (id) => api("PUT", `/api/v1/product/update-product/${id}`, form(base), { token });
  const r1 = await up(missing);
  const r2 = await up("not-an-id");
  check("update missing product -> 404", r1.status === 404 && r1.json.message === "Product not found", r1.text);
  check("update product with invalid id -> 404", r2.status === 404, r2.text);

  const upCat = (id, body) => api("PUT", `/api/v1/category/update-category/${id}`, body, { token });
  const other = await api("POST", "/api/v1/category/create-category", { name: "Toys" }, { token });
  const c1 = await upCat(categoryId, {});
  check("update category without name -> 400", c1.status === 400 && c1.json.message === "Name is required", c1.text);
  const c2 = await upCat(categoryId, { name: "Toys" });
  check("rename to an existing category -> 409", c2.status === 409 && c2.json.message === "Category already exists", c2.text);
  const c3 = await upCat(missing, { name: "Games" });
  const c4 = await upCat("nope", { name: "Games" });
  check("update missing/invalid category -> 404", c3.status === 404 && c4.status === 404, `${c3.status} ${c4.status}`);
  const c5 = await upCat(categoryId, { name: " Books & More " });
  check("valid rename works (trimmed, new slug, correct 'message' key)",
    c5.status === 200 && c5.json.category.name === "Books & More" && c5.json.category.slug === "books-and-more" && c5.json.message === "Category Updated Successfully", c5.text);
  const c6 = await upCat(other.json.category._id, { name: "Toys" });
  check("saving a category with its own name is not a duplicate", c6.status === 200, c6.text);
});
