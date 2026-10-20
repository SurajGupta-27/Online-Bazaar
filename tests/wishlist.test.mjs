// Wishlist: each signed-in user's own list of products, stored in the database.
import { withServer, check, ObjectId } from "./harness.mjs";
import { adminSetup } from "./fixtures.mjs";

await withServer(async ({ api, db }) => {
  const { token: admin } = await adminSetup(api, db);
  const signUp = async (name) => {
    await api("POST", "/api/v1/auth/register", { name, email: `${name}@x.com`, password: "secret1", phone: "1", address: "a", answer: "a" });
    return (await api("POST", "/api/v1/auth/login", { email: `${name}@x.com`, password: "secret1" })).json.token;
  };
  const ann = await signUp("ann");
  const bob = await signUp("bob");

  const products = db.collection("products");
  const cat = await db.collection("categories").findOne({});
  const pen = new ObjectId();
  const ink = new ObjectId();
  await products.insertMany([
    { _id: pen, name: "Pen", slug: "pen", description: "d", price: 120, category: cat._id, quantity: 0, ratingAverage: 4, ratingCount: 2, photo: { data: Buffer.from("x"), contentType: "image/png" } },
    { _id: ink, name: "Ink", slug: "ink", description: "d", price: 40, category: cat._id, quantity: 5 },
  ]);
  const get = (token) => api("GET", "/api/v1/wishlist", null, { token });
  const add = (token, pid) => api("POST", `/api/v1/wishlist/${pid}`, null, { token });
  const remove = (token, pid) => api("DELETE", `/api/v1/wishlist/${pid}`, null, { token });

  check("logged out: list -> 401", (await api("GET", "/api/v1/wishlist")).status === 401);
  check("logged out: add -> 401", (await api("POST", `/api/v1/wishlist/${pen}`)).status === 401);

  const empty = await get(ann);
  check("starts empty", empty.status === 200 && empty.json.items.length === 0, empty.text);

  const a1 = await add(ann, pen);
  check("add -> 201", a1.status === 201, a1.text);
  const a2 = await add(ann, pen);
  check("adding again -> 200, no duplicate", a2.status === 200 &&
    (await db.collection("wishlistitems").countDocuments({ product: pen })) === 1, a2.text);
  await add(ann, ink);

  const list = await get(ann);
  const [first, second] = list.json?.items || [];
  check("newest first", first?.product.name === "Ink" && second?.product.name === "Pen", list.text);
  check("items carry current product details and category",
    second?.product.price === 120 && second.product.quantity === 0 && second.product.ratingAverage === 4 &&
    second.product.category?.name === "Books" && second.addedAt, JSON.stringify(second));
  check("no legacy photo bytes in the list", !("photo" in (second?.product || {})));
  check("price when added is kept (for price-drop alerts)", second?.priceWhenAdded === 120);

  // Each user has their own list.
  check("other users' wishlists are separate", (await get(bob)).json.items.length === 0);
  await remove(bob, pen);
  check("another user can't remove my items", (await get(ann)).json.items.length === 2);

  check("unknown product -> 404", (await add(ann, new ObjectId())).status === 404);
  check("invalid id -> 404", (await add(ann, "not-an-id")).status === 404);

  const r1 = await remove(ann, pen);
  check("remove -> 200", r1.status === 200 && (await get(ann)).json.items.length === 1, r1.text);
  check("removing again is harmless", (await remove(ann, pen)).status === 200);

  // Price changes show up; the price when added doesn't change.
  await add(ann, pen);
  await products.updateOne({ _id: pen }, { $set: { price: 99 } });
  const after = (await get(ann)).json.items.find((i) => i.product.name === "Pen");
  check("current price shown, original price kept", after.product.price === 99 && after.priceWhenAdded === 120, JSON.stringify(after));

  // A product deleted by an admin disappears from wishlists.
  await add(bob, ink);
  const del = await api("DELETE", `/api/v1/product/delete-product/${ink}`, null, { token: admin });
  check("product deleted", del.status === 200, del.text);
  check("wishlist entries for it are deleted", (await db.collection("wishlistitems").countDocuments({ product: ink })) === 0);
  // ...and one removed some other way is skipped and cleaned up.
  await products.deleteOne({ _id: pen });
  const cleaned = await get(ann);
  check("missing products are skipped", cleaned.status === 200 && cleaned.json.items.length === 0, cleaned.text);
  check("and removed from the database", (await db.collection("wishlistitems").countDocuments({ product: pen })) === 0);

  // At most 100 items.
  const many = Array.from({ length: 101 }, (_, i) => ({
    _id: new ObjectId(), name: `P${i}`, slug: `p${i}`, description: "d", price: 1, category: cat._id, quantity: 1,
  }));
  await products.insertMany(many);
  const annId = (await db.collection("users").findOne({ email: "ann@x.com" }))._id;
  await db.collection("wishlistitems").insertMany(many.slice(0, 100).map((p) => ({
    user: annId, product: p._id, priceWhenAdded: 1, createdAt: new Date(), updatedAt: new Date(),
  })));
  const full = await add(ann, many[100]._id);
  check("101st item -> 400", full.status === 400 && /full/.test(full.json?.message || ""), full.text);
  check("re-adding an item that's already there is still fine", (await add(ann, many[0]._id)).status === 200);
});
