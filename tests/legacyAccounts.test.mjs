// Accounts created before Phase 1: plain-text security answers, and emails
// that were saved without being lowercased/trimmed.
import bcrypt from "bcrypt";
import { withServer, check } from "./harness.mjs";

const isHash = (v) => /^\$2[aby]\$/.test(v || "");

await withServer(async ({ api, db }) => {
  const users = db.collection("users");
  const password = await bcrypt.hash("oldpass1", 10);
  const legacy = (email, answer) =>
    users.insertOne({ name: "Old", email, password, phone: "1", address: "a", answer, role: 0 });

  // Forgot-password limiter allows 5 per window; this file uses 4.

  // Plain-text answer typed exactly as stored.
  await legacy("cricket.fan@example.com", "Cricket");
  const f1 = await api("POST", "/api/v1/auth/forgot-password", {
    email: "cricket.fan@example.com", answer: "Cricket", newPassword: "newpass1",
  });
  check("legacy plain-text answer 'Cricket' resets password", f1.status === 200, f1.text);
  const fan = await users.findOne({ email: "cricket.fan@example.com" });
  check("legacy answer upgraded to a hash", isHash(fan.answer));
  const fanLogin = await api("POST", "/api/v1/auth/login", { email: "cricket.fan@example.com", password: "newpass1" });
  check("login with the reset password", fanLogin.status === 200, fanLogin.text);

  // Email stored with capitals and a trailing space (saved before lowercasing).
  const { insertedId: mixedId } = await legacy("Mixed.Case@Example.com ", "Cricket");
  const f2 = await api("POST", "/api/v1/auth/forgot-password", {
    email: "mixed.case@example.com", answer: "cricket", newPassword: "newpass2",
  });
  check("legacy mixed-case email found on reset", f2.status === 200, f2.text);
  const mixed = await users.findOne({ _id: mixedId });
  check("legacy email normalized on reset", mixed.email === "mixed.case@example.com", mixed.email);

  // Plain-text answer containing an invisible zero-width space.
  await legacy("zw@example.com", "Cricket​");
  const f3 = await api("POST", "/api/v1/auth/forgot-password", {
    email: "zw@example.com", answer: "Cricket", newPassword: "newpass3",
  });
  check("legacy answer with zero-width space accepted", f3.status === 200, f3.text);

  // A wrong answer is still rejected for a legacy account.
  await legacy("wrong@example.com", "Cricket");
  const f4 = await api("POST", "/api/v1/auth/forgot-password", {
    email: "wrong@example.com", answer: "Football", newPassword: "newpass4",
  });
  check("legacy account rejects wrong answer", f4.status === 400, f4.text);
  const stillPlain = await users.findOne({ email: "wrong@example.com" });
  check("rejected reset leaves the account untouched", stillPlain.answer === "Cricket" && stillPlain.password === password);

  // Login for an old account (mixed-case email, plain-text answer).
  const { insertedId: loginId } = await legacy("Login.Old@Example.com", "Cricket");
  const l1 = await api("POST", "/api/v1/auth/login", { email: "login.old@example.com", password: "oldpass1" });
  check("old account can log in", l1.status === 200 && !!l1.json?.token, l1.text);
  const loggedIn = await users.findOne({ _id: loginId });
  check("login normalizes legacy email", loggedIn.email === "login.old@example.com", loggedIn.email);
  check("login upgrades legacy answer to a hash", isHash(loggedIn.answer));

  const l2 = await api("POST", "/api/v1/auth/login", { email: "LOGIN.OLD@example.com", password: "wrongpw" });
  check("old account wrong password -> 401", l2.status === 401, l2.text);
});
