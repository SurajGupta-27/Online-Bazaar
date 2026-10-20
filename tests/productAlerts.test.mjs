// Price-drop and back-in-stock emails. Emails are captured by tests/outbox.mjs
// (never sent). The one-a-day rule is tested by moving sentAt back in time.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withServer, check, ObjectId } from "./harness.mjs";
import { adminSetup } from "./fixtures.mjs";
import { createOutbox, emailEnv } from "./outbox.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 24 * 60 * 60 * 1000;
// Small batches, no pause between them, and a sweep every second.
const fast = { ALERT_BATCH_PAUSE_SECONDS: "0", ALERT_SWEEP_SECONDS: "1" };

const setup = async (api, db) => {
  const { token: admin, categoryId } = await adminSetup(api, db);
  const tokens = {};
  for (const name of ["ann", "bob", "cara", "dan", "eve", "frank", "gina"]) {
    await api("POST", "/api/v1/auth/register", { name: `${name[0].toUpperCase()}${name.slice(1)} Test`, email: `${name}@x.com`, password: "secret1", phone: "98765 43210", address: "12 MG Road", answer: "a" });
    tokens[name] = (await api("POST", "/api/v1/auth/login", { email: `${name}@x.com`, password: "secret1" })).json.token;
  }
  // The admin form always sends every field.
  const update = (pid, product, changes) => {
    const fd = new FormData();
    const fields = { name: product.name, description: "d", price: product.price, quantity: product.quantity, category: categoryId, shipping: "1", ...changes };
    Object.assign(product, changes);
    for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
    return api("PUT", `/api/v1/product/update-product/${pid}`, fd, { token: admin });
  };
  return { admin, categoryId, tokens, update };
};

const outbox = createOutbox();
const alertMails = () => outbox.read().filter((m) => /^(Price drop|Back in stock)/.test(m.subject));
const to = (mail) => mail.to?.map((t) => t.address).join();
// Waits for `count` alert emails, then a little longer to catch any extras.
const waitForAlerts = async (count, timeoutMs = 6000) => {
  const until = Date.now() + timeoutMs;
  while (alertMails().length < count && Date.now() < until) await sleep(50);
  await sleep(400);
  return alertMails();
};

// --- Price drops, back in stock, the one-a-day rule, unsubscribe ------------
await withServer(async ({ api, db, logs }) => {
  const { admin, categoryId, tokens, update } = await setup(api, db);
  const products = db.collection("products");
  const alerts = db.collection("alerts");
  const wishlist = (token, pid) => api("POST", `/api/v1/wishlist/${pid}`, null, { token });
  const notify = (token, pid) => api("POST", `/api/v1/alerts/restock/${pid}`, null, { token });
  // Pretend every alert so far went out more than a day ago.
  const dayPasses = async () => {
    await alerts.updateMany({ status: "sent" }, [{ $set: { sentAt: { $subtract: ["$sentAt", DAY + 60000] } } }]);
    await alerts.updateMany({ status: "pending" }, { $set: { sendAfter: new Date() } });
  };

  const lamp = new ObjectId();
  const lampDoc = { name: "Lamp <b>Bright</b>", price: 1000, quantity: 5 };
  await products.insertOne({ _id: lamp, ...lampDoc, slug: "lamp", description: "d", category: new ObjectId(categoryId),
    images: [{ url: "https://res.cloudinary.com/demo/image/upload/v1/online-bazaar/products/lamp.jpg", publicId: "lamp" }] });
  await wishlist(tokens.ann, lamp);
  await wishlist(tokens.cara, lamp);
  await products.updateOne({ _id: lamp }, { $set: { price: 900 } });
  lampDoc.price = 900;
  await wishlist(tokens.bob, lamp);
  await api("PUT", "/api/v1/alerts/preferences", { priceDrop: false }, { token: tokens.cara });

  // --- Price drop -------------------------------------------------------------
  const started = Date.now();
  const u1 = await update(lamp, lampDoc, { price: 850 });
  check("saving the product is not held up by alerts", u1.status === 201 && Date.now() - started < 3000, u1.text);
  let mails = await waitForAlerts(2);
  check("price drop emails wishlist users with alerts on (not Cara)", mails.length === 2 &&
    mails.map(to).sort().join() === "ann@x.com,bob@x.com", JSON.stringify(mails.map(to)));
  const annMail = mails.find((m) => to(m) === "ann@x.com");
  const bobMail = mails.find((m) => to(m) === "bob@x.com");
  check("subject names the product and new price", annMail?.subject === "Price drop: Lamp <b>Bright</b> is now ₹850 - Online Bazaar", annMail?.subject);
  check("compares with the price when Ann saved it", /Was: ₹1,000 \(when you saved it\)/.test(annMail?.text) && /Now: ₹850/.test(annMail.text) && /You save ₹150 \(15%\)/.test(annMail.text), annMail?.text);
  check("Bob saved it at ₹900", /Was: ₹900/.test(bobMail?.text) && /You save ₹50 \(5%\)/.test(bobMail.text), bobMail?.text);
  check("HTML escapes the product name", /Lamp &lt;b&gt;Bright&lt;\/b&gt;/.test(annMail?.html) && !/<b>Bright/.test(annMail?.html));
  check("HTML shows old, new and saving", /line-through;">₹1,000</.test(annMail?.html) && /Now ₹850/.test(annMail.html) && /You save ₹150 \(15%\)/.test(annMail.html));
  check("resized JPEG product image", annMail?.html.includes("/image/upload/c_limit,w_240,q_auto,f_jpg/v1/online-bazaar/products/lamp.jpg"));
  check("links to the product page", annMail?.text.includes("View product: http://localhost:3000/product/lamp"));
  const unsubLine = annMail?.text.match(/Unsubscribe from price-drop alerts: (\S+)/)?.[1] || "";
  check("has an unsubscribe link to the /unsubscribe page", unsubLine.startsWith("http://localhost:3000/unsubscribe?u="), unsubLine);
  check("and a link to manage alerts", annMail?.text.includes("Manage email alerts: http://localhost:3000/dashboard/user/profile"));
  const headers = JSON.stringify(annMail?.headers || {}) + JSON.stringify(annMail?.list || {});
  check("one-click List-Unsubscribe headers", /List-Unsubscribe-Post/i.test(headers) && /api\/v1\/alerts\/unsubscribe\?u=/.test(headers), headers);
  check("never mentions other customers", !/bob@x\.com|Bob/.test(annMail?.html + annMail?.text));
  const annItem = await db.collection("wishlistitems").findOne({ product: lamp, priceWhenAdded: 1000, lastAlertedPrice: 850 });
  check("records the alerted price on the wishlist item", Boolean(annItem));
  check("sent alerts are recorded", (await alerts.countDocuments({ product: lamp, status: "sent", kind: "price_drop" })) === 2);

  // No duplicates for the same change.
  await update(lamp, lampDoc, { name: "Lamp <b>Bright</b>" });
  await update(lamp, lampDoc, { price: 850 });
  check("saving again at the same price sends nothing", (await waitForAlerts(3, 800)).length === 2);
  await dayPasses();
  await update(lamp, lampDoc, { price: 950 });
  await update(lamp, lampDoc, { price: 850 });
  check("up and back down to an alerted price: nothing (even a day later)", (await waitForAlerts(3, 800)).length === 2);
  check("nothing even queued", (await alerts.countDocuments({ status: "pending" })) === 0);

  await update(lamp, lampDoc, { price: 800 });
  mails = await waitForAlerts(4);
  check("a new, lower price is a new alert", mails.length === 4 && mails.slice(2).every((m) => /is now ₹800/.test(m.subject)), JSON.stringify(mails.map((m) => m.subject)));

  // At most one alert per product per customer per day: a later one waits.
  await update(lamp, lampDoc, { price: 700 });
  await sleep(1500);
  check("another drop the same day waits", alertMails().length === 4);
  const waiting = await alerts.find({ product: lamp, status: "pending" }).toArray();
  check("queued with a time a day after the last email", waiting.length === 2 && waiting.every((a) => a.sendAfter > new Date(Date.now() + DAY - 120000)), JSON.stringify(waiting));
  await update(lamp, lampDoc, { price: 650 });
  check("further drops update the waiting alert, not add one", (await alerts.countDocuments({ product: lamp, status: "pending" })) === 2);
  await dayPasses();
  mails = await waitForAlerts(6);
  check("next day it goes out once, with the current price", mails.length === 6 && mails.slice(4).every((m) => /is now ₹650/.test(m.subject)), JSON.stringify(mails.map((m) => m.subject)));

  // A waiting alert is checked again before it goes out.
  await update(lamp, lampDoc, { price: 600 });
  await sleep(500);
  await update(lamp, lampDoc, { price: 700 });
  await dayPasses();
  await sleep(2000);
  check("price went back up while waiting: skipped", alertMails().length === 6 &&
    (await alerts.countDocuments({ product: lamp, status: "skipped", note: "price is no longer lower" })) === 2);

  // --- Back in stock ------------------------------------------------------------
  const fan = new ObjectId();
  const fanDoc = { name: "Fan", price: 500, quantity: 0 };
  await products.insertOne({ _id: fan, ...fanDoc, slug: "fan", description: "d", category: new ObjectId(categoryId) });
  await notify(tokens.dan, fan);
  await notify(tokens.ann, fan);
  await wishlist(tokens.ann, fan);
  await wishlist(tokens.eve, fan);
  await notify(tokens.frank, fan);
  await api("PUT", "/api/v1/alerts/preferences", { backInStock: false }, { token: tokens.frank });
  outbox.clear();

  await update(fan, fanDoc, { quantity: 10 });
  mails = await waitForAlerts(3);
  check("restock emails requesters and wishlist users once each (not Frank)", mails.length === 3 &&
    mails.map(to).sort().join() === "ann@x.com,dan@x.com,eve@x.com", JSON.stringify(mails.map(to)));
  const danMail = mails.find((m) => to(m) === "dan@x.com");
  const eveMail = mails.find((m) => to(m) === "eve@x.com");
  check("subject", danMail?.subject === "Back in stock: Fan - Online Bazaar", danMail?.subject);
  check("requester is told why", /you asked us to tell you when this product is back in stock/.test(danMail?.text) && /Price: ₹500/.test(danMail.text), danMail?.text);
  check("wishlist user is told why", /this product is on your wishlist/.test(eveMail?.text));
  check("unsubscribe link is for back-in-stock alerts", /Unsubscribe from back-in-stock alerts: http:\/\/localhost:3000\/unsubscribe\?.*k=back_in_stock/.test(danMail?.text));
  const requests = db.collection("restockrequests");
  check("each request is used once", (await requests.countDocuments({ product: fan })) === 1 &&
    (await requests.countDocuments({ product: fan, user: (await db.collection("users").findOne({ email: "frank@x.com" }))._id })) === 1);

  await update(fan, fanDoc, { quantity: 20 });
  check("more stock on an in-stock product: nothing", (await waitForAlerts(4, 800)).length === 3);

  // Sold out and back again the same day: Dan's request is used up; wishlist
  // users wait a day, and by then it's sold out again.
  await update(fan, fanDoc, { quantity: 0 });
  await update(fan, fanDoc, { quantity: 4 });
  await sleep(1000);
  check("back again the same day waits", alertMails().length === 3 &&
    (await alerts.countDocuments({ product: fan, status: "pending" })) === 2 &&
    !(await alerts.findOne({ product: fan, status: "pending", user: (await db.collection("users").findOne({ email: "dan@x.com" }))._id })));
  await products.updateOne({ _id: fan }, { $set: { quantity: 0 } });
  await dayPasses();
  await sleep(2000);
  check("sold out again while waiting: skipped", alertMails().length === 3 &&
    (await alerts.countDocuments({ product: fan, status: "skipped", note: "out of stock again" })) === 2);

  // Stock coming back from a cancelled order counts too.
  const cup = new ObjectId();
  await products.insertOne({ _id: cup, name: "Cup", slug: "cup", description: "d", price: 99, category: new ObjectId(categoryId), quantity: 1 });
  const order = await api("POST", "/api/v1/order/create-order", { shippingAddress: "12 MG Road", paymentMethod: "cod", items: [{ product: String(cup), quantity: 1 }] }, { token: tokens.bob });
  check("order takes the last cup", order.status === 201 && (await products.findOne({ _id: cup })).quantity === 0, order.text);
  check("gina asks to be notified", (await notify(tokens.gina, cup)).status === 201);
  const cancel = await api("PUT", `/api/v1/order/order-status/${order.json.order._id}`, { status: "cancelled" }, { token: admin });
  check("admin cancels the order", cancel.status === 200, cancel.text);
  mails = await waitForAlerts(4);
  check("restock from a cancelled order emails Gina", mails.length === 4 && to(mails[3]) === "gina@x.com" && /Back in stock: Cup/.test(mails[3].subject), JSON.stringify(mails.map((m) => m.subject)));

  // --- Unsubscribe from the email's link ------------------------------------------
  const params = new URL(unsubLine).searchParams;
  const unsub = await api("POST", "/api/v1/alerts/unsubscribe", Object.fromEntries(params));
  check("the email's link unsubscribes Ann without logging in", unsub.status === 200 && unsub.json.kind === "price_drop", unsub.text);
  outbox.clear();
  await dayPasses();
  await update(lamp, lampDoc, { price: 500 });
  mails = await waitForAlerts(1);
  check("Ann gets no more price drops; Bob still does", mails.length === 1 && to(mails[0]) === "bob@x.com", JSON.stringify(mails.map(to)));

  // Deleting a product drops its queued alerts.
  await update(lamp, lampDoc, { price: 400 });
  await sleep(300);
  await api("DELETE", `/api/v1/product/delete-product/${lamp}`, null, { token: admin });
  check("deleting a product deletes its alerts", (await alerts.countDocuments({ product: lamp })) === 0);
  check("no customer emails in the logs", !/ann@x\.com|bob@x\.com/.test(logs().split("\n").filter((l) => /Alert/.test(l)).join("\n")));
}, { env: { ...emailEnv(outbox), ...fast } });

// --- Batches and the daily limit -----------------------------------------------
outbox.clear();
await withServer(async ({ api, db, logs }) => {
  const { tokens, categoryId, update } = await setup(api, db);
  const kettle = new ObjectId();
  const doc = { name: "Kettle", price: 2000, quantity: 3 };
  await db.collection("products").insertOne({ _id: kettle, ...doc, slug: "kettle", description: "d", category: new ObjectId(categoryId) });
  for (const name of ["ann", "bob", "cara", "dan", "eve"]) await api("POST", `/api/v1/wishlist/${kettle}`, null, { token: tokens[name] });
  await update(kettle, doc, { price: 1500 });
  await waitForAlerts(3, 4000);
  await sleep(1500);
  check("stops at the daily limit", alertMails().length === 3, String(alertMails().length));
  check("sends in batches", /Alert emails: 2 sent/.test(logs()) && /Alert emails: 1 sent/.test(logs()), logs().split("\n").filter((l) => /Alert/.test(l)).join(" | "));
  check("logs that the limit was reached", /daily limit of 3 reached; 2 waiting/.test(logs()));
  check("the rest wait for later", (await db.collection("alerts").countDocuments({ status: "pending" })) === 2);
}, { port: 8098, env: { ...emailEnv(outbox), ...fast, ALERT_BATCH_SIZE: "2", ALERT_DAILY_LIMIT: "3" } });

// --- Failures are logged and retried --------------------------------------------
// An outbox that is a directory: every send fails after the message is built.
await withServer(async ({ api, db, logs }) => {
  const { tokens, categoryId, update } = await setup(api, db);
  const mug = new ObjectId();
  const doc = { name: "Mug", price: 300, quantity: 3 };
  await db.collection("products").insertOne({ _id: mug, ...doc, slug: "mug", description: "d", category: new ObjectId(categoryId) });
  await api("POST", `/api/v1/wishlist/${mug}`, null, { token: tokens.ann });
  await update(mug, doc, { price: 250 });
  await sleep(1500);
  const alert = await db.collection("alerts").findOne({ product: mug });
  check("failure is logged", /Alert email failed \(price_drop .*attempt 1\/3\)/.test(logs()), logs().split("\n").filter((l) => /Alert/.test(l)).join(" | "));
  check("and retried later", alert?.status === "pending" && alert.attempts === 1 && alert.sendAfter > new Date(), JSON.stringify(alert));
  check("the price claim is undone, so the retry can send it",
    !(await db.collection("wishlistitems").findOne({ product: mug })).lastAlertedPrice);
  await db.collection("alerts").updateOne({ _id: alert._id }, { $set: { attempts: 2, sendAfter: new Date() } });
  await sleep(1800);
  const failed = await db.collection("alerts").findOne({ _id: alert._id });
  check("gives up after 3 attempts", failed.status === "failed" && failed.attempts === 3 && failed.finishedAt, JSON.stringify(failed));
}, { port: 8097, env: { ...emailEnv({ file: mkdtempSync(join(tmpdir(), "ob-bad-outbox-")) }), ...fast } });
