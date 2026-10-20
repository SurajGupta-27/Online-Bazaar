// Accounts created with Google sign-in have no password, security answer,
// phone or address. Password login and forgot-password must treat them like
// unknown accounts, and the profile page lets them add all of these.
import JWT from "jsonwebtoken";
import { withServer, check, ObjectId } from "./harness.mjs";

const isHash = (v) => /^\$2[aby]\$/.test(v || "");
const noSecrets = (u) => u && !("password" in u) && !("answer" in u) && !("googleId" in u);

await withServer(async ({ api, db }) => {
  const users = db.collection("users");
  const { insertedId } = await users.insertOne({
    name: "Gia", email: "gia@example.com", googleId: "google-sub-1", role: 0,
  });
  const token = JWT.sign({ _id: insertedId.toString() }, "test-secret", { expiresIn: "1h" });

  // Login limiter allows 10 failures; forgot-password limiter allows 5.
  const login = await api("POST", "/api/v1/auth/login", { email: "gia@example.com", password: "anything" });
  const unknown = await api("POST", "/api/v1/auth/login", { email: "nobody@example.com", password: "anything" });
  check("password login for a Google-only account -> 401", login.status === 401, login.text);
  check("same message as an unknown email", login.json?.message === unknown.json?.message);

  // The answer "undefined" must not match a missing answer.
  for (const answer of ["undefined", "null", "anything"]) {
    const r = await api("POST", "/api/v1/auth/forgot-password", { email: "gia@example.com", answer, newPassword: "newpass1" });
    check(`forgot-password with answer "${answer}" -> 400`, r.status === 400, r.text);
  }
  const untouched = await users.findOne({ _id: insertedId });
  check("rejected resets leave the account without a password or answer",
    !("password" in untouched) && !("answer" in untouched), JSON.stringify(untouched));

  // No checkout until the profile has a phone number and an address.
  const productId = new ObjectId();
  await db.collection("products").insertOne({
    _id: productId, name: "Pen", slug: "pen", description: "d", price: 10, category: new ObjectId(), quantity: 5,
  });
  const order = (t) => api("POST", "/api/v1/order/create-order",
    { shippingAddress: "Somewhere", items: [{ product: productId.toString(), quantity: 1 }] }, { token: t });
  const blocked = await order(token);
  check("order without phone and address -> 400 asking to complete the profile",
    blocked.status === 400 && /profile/.test(blocked.json?.message || ""), blocked.text);
  const phoneOnly = await users.insertOne({ name: "Pia", email: "pia@example.com", googleId: "google-sub-2", phone: "123", role: 0 });
  const phoneOnlyOrder = await order(JWT.sign({ _id: phoneOnly.insertedId.toString() }, "test-secret", { expiresIn: "1h" }));
  check("order with a phone but no address -> 400", phoneOnlyOrder.status === 400, phoneOnlyOrder.text);
  check("blocked orders reserve no stock and create no order",
    (await db.collection("products").findOne({ _id: productId })).quantity === 5 &&
    (await db.collection("orders").countDocuments()) === 0);

  // Profile: phone and address only.
  const p1 =await api("PUT", "/api/v1/auth/profile", { phone: " 98765 43210 ", address: " 1 MG Road " }, { token });
  check("Google-only account can add phone and address", p1.status === 200 &&
    p1.json.updatedUser.phone === "98765 43210" && p1.json.updatedUser.address === "1 MG Road", p1.text);
  check("profile response has no secrets", noSecrets(p1.json?.updatedUser), JSON.stringify(p1.json?.updatedUser));
  check("flags: no password yet, Google linked",
    p1.json?.updatedUser.hasPassword === false && p1.json?.updatedUser.googleLinked === true);
  const noPassword = await users.findOne({ _id: insertedId });
  check("a profile update without a password doesn't create one", !("password" in noPassword));
  const placed = await order(token);
  check("with a complete profile the order goes through", placed.json?.success === true, placed.text);

  const short = await api("PUT", "/api/v1/auth/profile", { password: "12345" }, { token });
  check("too-short password rejected", short.status === 400, short.text);

  // Setting a password later.
  const p2 = await api("PUT", "/api/v1/auth/profile", { password: "gia-pass1" }, { token });
  check("Google-only account can set a password", p2.status === 200 && p2.json.updatedUser.hasPassword === true, p2.text);
  const withPassword = await users.findOne({ _id: insertedId });
  check("password stored as a bcrypt hash", isHash(withPassword.password));
  check("Google link kept", withPassword.googleId === "google-sub-1");
  const relog = await api("POST", "/api/v1/auth/login", { email: "gia@example.com", password: "gia-pass1" });
  check("then logs in with email and password", relog.status === 200 && noSecrets(relog.json?.user), relog.text);
  check("still no security answer after logging in", !("answer" in (await users.findOne({ _id: insertedId }))));

  // Admin list reports the flags without secrets.
  await api("POST", "/api/v1/auth/register", { name: "Admin", email: "admin@x.com", password: "secret1", phone: "1", address: "a", answer: "a" });
  await users.updateOne({ email: "admin@x.com" }, { $set: { role: 1 } });
  const admin = await api("POST", "/api/v1/auth/login", { email: "admin@x.com", password: "secret1" });
  check("password account reports hasPassword and no Google link",
    admin.json?.user.hasPassword === true && admin.json?.user.googleLinked === false);
  const list = await api("GET", "/api/v1/auth/all-users", null, { token: admin.json.token });
  const gia = list.json?.users.find((u) => u.email === "gia@example.com");
  check("admin user list has no secrets", list.status === 200 && list.json.users.every(noSecrets), list.text);
  check("admin user list reports the flags", gia?.hasPassword === true && gia?.googleLinked === true);

  // Password accounts still need every field.
  const reg = await api("POST", "/api/v1/auth/register", { name: "Rae", email: "rae@x.com", password: "secret1", phone: "1", address: "a" });
  check("register still requires a security answer", reg.status === 400, reg.text);
});
