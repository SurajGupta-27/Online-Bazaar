import { withServer, check } from "./harness.mjs";

const isHash = (v) => /^\$2[aby]\$/.test(v || "");
const noSecrets = (u) => u && !("password" in u) && !("answer" in u);

await withServer(async ({ api, db }) => {
  const users = db.collection("users");
  const reg = await api("POST", "/api/v1/auth/register", {
    name: "Ann", email: "Ann@Example.com", password: "secret1",
    phone: "123", address: "1 Road", answer: "  Cricket ",
  });
  check("register 201", reg.status === 201, reg.text);
  check("register response has no password/answer", noSecrets(reg.json?.user), JSON.stringify(reg.json?.user));
  const stored = await users.findOne({ email: "ann@example.com" });
  check("answer stored as bcrypt hash", isHash(stored.answer), stored.answer);

  let failedLogins = 0;
  const badEmail = await api("POST", "/api/v1/auth/login", { email: "nobody@x.com", password: "whatever" });
  failedLogins++;
  const badPass = await api("POST", "/api/v1/auth/login", { email: "ann@example.com", password: "wrongpw" });
  failedLogins++;
  check("unknown email -> 401", badEmail.status === 401, String(badEmail.status));
  check("same error for unknown email and wrong password",
    badEmail.status === badPass.status && badEmail.json?.message === badPass.json?.message,
    `${badEmail.json?.message} / ${badPass.json?.message}`);

  const login = await api("POST", "/api/v1/auth/login", { email: "ann@example.com", password: "secret1" });
  check("login ok without secrets", login.status === 200 && noSecrets(login.json.user));
  const token = login.json.token;

  const prof = await api("PUT", "/api/v1/auth/profile", { name: "Ann B" }, { token });
  check("profile response has no password/answer",
    prof.status === 200 && noSecrets(prof.json.updatedUser) && prof.json.updatedUser.name === "Ann B",
    JSON.stringify(prof.json));

  // Forgot password (limit is 5 per window)
  const f1 = await api("POST", "/api/v1/auth/forgot-password", { email: "ANN@example.com", answer: "CRICKET", newPassword: "newpass1" });
  check("reset with hashed answer (case-insensitive)", f1.status === 200, f1.text);
  const relog = await api("POST", "/api/v1/auth/login", { email: "ann@example.com", password: "newpass1" });
  check("login with new password", relog.status === 200);
  const f2 = await api("POST", "/api/v1/auth/forgot-password", { email: "ann@example.com", answer: "football", newPassword: "xxxxxx" });
  const f3 = await api("POST", "/api/v1/auth/forgot-password", { email: "ghost@example.com", answer: "football", newPassword: "xxxxxx" });
  check("wrong answer and unknown email look identical",
    f2.status === 400 && f3.status === 400 && f2.json.message === f3.json.message, `${f2.status} ${f3.status}`);

  // Legacy plain-text answers: reset still works and upgrades the hash
  await users.insertOne({ name: "Old", email: "old@example.com", password: stored.password, phone: "1", address: "a", answer: "Tennis", role: 0 });
  const f4 = await api("POST", "/api/v1/auth/forgot-password", { email: "old@example.com", answer: "tennis", newPassword: "oldnew1" });
  check("legacy plain-text answer accepted", f4.status === 200, f4.text);
  check("legacy answer upgraded to hash on reset", isHash((await users.findOne({ email: "old@example.com" })).answer));

  // Legacy answer upgraded on login
  await users.insertOne({ name: "Old2", email: "old2@example.com", password: stored.password, phone: "1", address: "a", answer: "Chess", role: 0 });
  const l2 = await api("POST", "/api/v1/auth/login", { email: "old2@example.com", password: "secret1" });
  const old2 = await users.findOne({ email: "old2@example.com" });
  check("legacy answer upgraded to hash on login", l2.status === 200 && isHash(old2.answer), l2.text);

  // Forgot-password limiter: 4 used so far, 5th allowed, 6th blocked
  const f5 = await api("POST", "/api/v1/auth/forgot-password", { email: "x@x.com", answer: "a", newPassword: "xxxxxx" });
  const f6 = await api("POST", "/api/v1/auth/forgot-password", { email: "x@x.com", answer: "a", newPassword: "xxxxxx" });
  check("forgot-password: 5th attempt allowed, 6th -> 429 with message",
    f5.status === 400 && f6.status === 429 && /Too many attempts/.test(f6.json?.message), `${f5.status} ${f6.status} ${f6.text}`);

  // Login limiter: successful logins don't count; 10 failures then 429
  let firstBlocked = null;
  for (let i = 0; i < 12 && !firstBlocked; i++) {
    const r = await api("POST", "/api/v1/auth/login", { email: "ann@example.com", password: "nope" });
    if (r.status === 429) firstBlocked = failedLogins + 1;
    else failedLogins++;
  }
  check("login blocked after exactly 10 failed attempts", firstBlocked === 11, `blocked at attempt ${firstBlocked}`);
  const blockedGood = await api("POST", "/api/v1/auth/login", { email: "ann@example.com", password: "newpass1" });
  check("blocked IP can't log in until window ends", blockedGood.status === 429);
});
