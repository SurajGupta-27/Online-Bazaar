// Alert settings, "Notify me when available" requests and signed unsubscribe
// links. The emails themselves are tested in productAlerts.test.mjs.
import { withServer, check, ObjectId } from "./harness.mjs";
import { adminSetup } from "./fixtures.mjs";
import { unsubscribeToken } from "../helpers/alertTokens.js";

// The harness gives the server this secret; sign links with the same one.
process.env.JWT_SECRET = "test-secret";

await withServer(async ({ api, db }) => {
  const { token: admin } = await adminSetup(api, db);
  const signUp = async (name) => {
    await api("POST", "/api/v1/auth/register", { name, email: `${name}@x.com`, password: "secret1", phone: "1", address: "a", answer: "a" });
    return (await api("POST", "/api/v1/auth/login", { email: `${name}@x.com`, password: "secret1" })).json;
  };
  const { token: ann, user: annUser } = await signUp("ann");
  const { token: bob } = await signUp("bob");
  const users = db.collection("users");

  // --- Preferences ----------------------------------------------------------
  check("login response carries alert settings (on by default)",
    annUser.alerts?.priceDrop === true && annUser.alerts?.backInStock === true, JSON.stringify(annUser));
  check("logged out: preferences -> 401", (await api("GET", "/api/v1/alerts/preferences")).status === 401);
  const prefs = await api("GET", "/api/v1/alerts/preferences", null, { token: ann });
  check("preferences default to on", prefs.status === 200 && prefs.json.alerts.priceDrop && prefs.json.alerts.backInStock, prefs.text);

  // Accounts from before alerts existed have no setting: that means on.
  await users.updateOne({ email: "bob@x.com" }, { $unset: { alertPrefs: 1 } });
  const legacy = await api("GET", "/api/v1/alerts/preferences", null, { token: bob });
  check("missing settings count as on", legacy.json?.alerts?.priceDrop === true && legacy.json.alerts.backInStock === true, legacy.text);

  const off = await api("PUT", "/api/v1/alerts/preferences", { priceDrop: false }, { token: ann });
  check("turn price-drop alerts off", off.status === 200 && off.json.alerts.priceDrop === false && off.json.alerts.backInStock === true, off.text);
  check("stored on the user", (await users.findOne({ email: "ann@x.com" })).alertPrefs.priceDrop === false);
  check("other users unaffected", (await users.findOne({ email: "admin@x.com" })).alertPrefs.priceDrop === true);
  const bad = await api("PUT", "/api/v1/alerts/preferences", { priceDrop: "no" }, { token: ann });
  check("non-boolean setting -> 400", bad.status === 400, bad.text);
  check("empty update -> 400", (await api("PUT", "/api/v1/alerts/preferences", { role: 1 }, { token: ann })).status === 400);
  check("can't set other fields through it", (await users.findOne({ email: "ann@x.com" })).role === 0);
  const relogin = await api("POST", "/api/v1/auth/login", { email: "ann@x.com", password: "secret1" });
  check("login reflects the change", relogin.json.user.alerts.priceDrop === false);
  await api("PUT", "/api/v1/alerts/preferences", { priceDrop: true }, { token: ann });

  // --- Notify me when available --------------------------------------------
  const cat = await db.collection("categories").findOne({});
  const lamp = new ObjectId();
  const desk = new ObjectId();
  await db.collection("products").insertMany([
    { _id: lamp, name: "Lamp", slug: "lamp", description: "d", price: 500, category: cat._id, quantity: 0 },
    { _id: desk, name: "Desk", slug: "desk", description: "d", price: 900, category: cat._id, quantity: 4 },
  ]);
  const requests = db.collection("restockrequests");
  check("logged out: notify -> 401", (await api("POST", `/api/v1/alerts/restock/${lamp}`)).status === 401);
  const n1 = await api("POST", `/api/v1/alerts/restock/${lamp}`, null, { token: ann });
  check("notify me -> 201", n1.status === 201, n1.text);
  const n2 = await api("POST", `/api/v1/alerts/restock/${lamp}`, null, { token: ann });
  check("asking again -> 200, no duplicate", n2.status === 200 && (await requests.countDocuments({ product: lamp })) === 1, n2.text);
  const inStock = await api("POST", `/api/v1/alerts/restock/${desk}`, null, { token: ann });
  check("in-stock product -> 400", inStock.status === 400 && /in stock/.test(inStock.json.message), inStock.text);
  check("unknown product -> 404", (await api("POST", `/api/v1/alerts/restock/${new ObjectId()}`, null, { token: ann })).status === 404);
  check("invalid id -> 404", (await api("POST", "/api/v1/alerts/restock/nope", null, { token: ann })).status === 404);

  const mine = await api("GET", "/api/v1/alerts/restock", null, { token: ann });
  check("my requests list the product", mine.status === 200 && mine.json.products.length === 1 && mine.json.products[0] === String(lamp), mine.text);
  check("others don't see them", (await api("GET", "/api/v1/alerts/restock", null, { token: bob })).json.products.length === 0);
  await api("DELETE", `/api/v1/alerts/restock/${lamp}`, null, { token: bob });
  check("another user can't cancel mine", (await requests.countDocuments({ product: lamp })) === 1);
  const cancel = await api("DELETE", `/api/v1/alerts/restock/${lamp}`, null, { token: ann });
  check("cancel -> 200", cancel.status === 200 && (await requests.countDocuments({ product: lamp })) === 0, cancel.text);
  check("cancelling again is harmless", (await api("DELETE", `/api/v1/alerts/restock/${lamp}`, null, { token: ann })).status === 200);

  // At most 100 waiting per user.
  const many = Array.from({ length: 100 }, (_, i) => ({ user: new ObjectId(annUser._id), product: new ObjectId(), createdAt: new Date() }));
  await requests.insertMany(many);
  const full = await api("POST", `/api/v1/alerts/restock/${lamp}`, null, { token: ann });
  check("101st request -> 400", full.status === 400 && /100/.test(full.json.message), full.text);
  await requests.deleteMany({ user: new ObjectId(annUser._id) });

  // Deleting a product deletes the requests for it.
  await api("POST", `/api/v1/alerts/restock/${lamp}`, null, { token: bob });
  const del = await api("DELETE", `/api/v1/product/delete-product/${lamp}`, null, { token: admin });
  check("product deleted", del.status === 200, del.text);
  check("its requests are deleted", (await requests.countDocuments({ product: lamp })) === 0);

  // --- Unsubscribe links -----------------------------------------------------
  const annId = annUser._id;
  const link = (kind, extra = {}) => ({ u: annId, k: kind, t: unsubscribeToken(annId, kind), ...extra });
  const u1 = await api("POST", "/api/v1/alerts/unsubscribe", link("back_in_stock"));
  check("unsubscribe without logging in -> 200", u1.status === 200 && u1.json.subscribed === false && u1.json.kind === "back_in_stock", u1.text);
  let ann1 = await users.findOne({ email: "ann@x.com" });
  check("only that kind is turned off", ann1.alertPrefs.backInStock === false && ann1.alertPrefs.priceDrop === true);
  check("response names no one", !/ann/i.test(u1.text));
  const re = await api("POST", "/api/v1/alerts/resubscribe", link("back_in_stock"));
  check("resubscribe with the same link", re.status === 200 && (await users.findOne({ email: "ann@x.com" })).alertPrefs.backInStock === true, re.text);

  // Mail apps' one-click unsubscribe: a form POST to the link in the List-Unsubscribe header.
  const q = new URLSearchParams(link("price_drop")).toString();
  const oneClick = await api("POST", `/api/v1/alerts/unsubscribe?${q}`, undefined, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  check("one-click POST with the link in the query string", oneClick.status === 200 && (await users.findOne({ email: "ann@x.com" })).alertPrefs.priceDrop === false, oneClick.text);
  await api("POST", "/api/v1/alerts/resubscribe", link("price_drop"));

  const forged = [
    ["wrong token", link("price_drop", { t: "x".repeat(43) })],
    ["token for another kind", link("price_drop", { t: unsubscribeToken(annId, "back_in_stock") })],
    ["token for another user", link("price_drop", { u: String(new ObjectId()) })],
    ["unknown kind", link("everything", { t: unsubscribeToken(annId, "everything") })],
    ["missing token", { u: annId, k: "price_drop" }],
    ["array values", { u: [annId], k: "price_drop", t: [unsubscribeToken(annId, "price_drop")] }],
  ];
  for (const [label, body] of forged) {
    const r = await api("POST", "/api/v1/alerts/unsubscribe", body);
    check(`${label} -> 400`, r.status === 400 && r.json?.message === "This link is invalid", r.text);
  }
  const ghost = String(new ObjectId());
  const g = await api("POST", "/api/v1/alerts/unsubscribe", { u: ghost, k: "price_drop", t: unsubscribeToken(ghost, "price_drop") });
  check("valid token for a missing user -> same 400", g.status === 400 && g.json.message === "This link is invalid", g.text);
  ann1 = await users.findOne({ email: "ann@x.com" });
  check("forged links changed nothing", ann1.alertPrefs.priceDrop === true && ann1.alertPrefs.backInStock === true);
});
