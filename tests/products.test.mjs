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
});
