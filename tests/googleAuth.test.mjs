// Google sign-in: POST /api/v1/auth/google with a Google ID token. Tokens are
// signed by tests/mockGoogle.mjs and checked by the real google-auth-library.
import { withServer, check } from "./harness.mjs";
import { CLIENT_ID, googleEnv, startMockGoogle } from "./mockGoogle.mjs";

const noSecrets = (u) => u && !("password" in u) && !("answer" in u) && !("googleId" in u);
const now = () => Math.floor(Date.now() / 1000);

const google = await startMockGoogle();
try {
  await withServer(async ({ api, db }) => {
    const users = db.collection("users");
    const signIn = (credential, extra = {}) => api("POST", "/api/v1/auth/google", { credential, ...extra });
    // The Google limiter allows 10 rejected attempts per window; count them.
    let failures = 0;
    const rejected = async (label, status, credential) => {
      const r = await api("POST", "/api/v1/auth/google", credential === undefined ? {} : { credential });
      failures++;
      check(label, r.status === status && r.json?.success === false && !r.json?.token, `${r.status} ${r.text}`);
      return r;
    };

    // New account. Every extra field the browser sends is ignored.
    const created = await signIn(
      google.idToken({ sub: "g-new", email: "New.User@Gmail.com", name: "New User" }),
      { role: 1, email: "attacker@x.com", name: "Hacker", googleId: "g-evil", password: "x" }
    );
    check("new Google account -> 201 with a token", created.status === 201 && created.json?.token, created.text);
    const newUser = created.json?.user;
    check("response has no secrets", noSecrets(newUser), JSON.stringify(newUser));
    check("name and email come from the verified token",
      newUser?.name === "New User" && newUser?.email === "new.user@gmail.com", JSON.stringify(newUser));
    check("new account is a customer (role 0), never admin", newUser?.role === 0);
    check("flags: no password, Google linked", newUser?.hasPassword === false && newUser?.googleLinked === true);
    const stored = await users.findOne({ email: "new.user@gmail.com" });
    check("stored with Google's id and no password, answer, phone or address",
      stored?.googleId === "g-new" && stored.role === 0 &&
      !["password", "answer", "phone", "address"].some((k) => k in stored), JSON.stringify(stored));
    check("nothing was created for the email the browser sent", !(await users.findOne({ email: "attacker@x.com" })));

    const token = created.json?.token;
    const userAuth = await api("GET", "/api/v1/auth/user-auth", null, { token });
    check("the token is our normal JWT and works", userAuth.status === 200, userAuth.text);
    const adminAuth = await api("GET", "/api/v1/auth/admin-auth", null, { token });
    check("and grants no admin access", adminAuth.status !== 200, String(adminAuth.status));

    // Signing in again finds the same account.
    const again = await signIn(google.idToken({ sub: "g-new", email: "new.user@gmail.com" }));
    check("returning Google user -> 200, same account",
      again.status === 200 && again.json?.user._id === newUser?._id, again.text);
    check("no duplicate account", (await users.countDocuments({ email: "new.user@gmail.com" })) === 1);

    // Existing password account with the same email gets linked.
    await api("POST", "/api/v1/auth/register", {
      name: "Pat", email: "pat@example.com", password: "secret1", phone: "1", address: "a", answer: "chess",
    });
    const before = await users.findOne({ email: "pat@example.com" });
    const linked = await signIn(google.idToken({ sub: "g-pat", email: "PAT@example.com", name: "Someone Else" }));
    check("existing email -> 200, linked to the same account",
      linked.status === 200 && linked.json?.user._id === before._id.toString(), linked.text);
    const after = await users.findOne({ email: "pat@example.com" });
    check("link stored; password, answer, name and role unchanged",
      after.googleId === "g-pat" && after.password === before.password && after.answer === before.answer &&
      after.name === "Pat" && after.role === 0, JSON.stringify(after));
    check("linked account reports both sign-in methods",
      linked.json?.user.hasPassword === true && linked.json?.user.googleLinked === true);
    const passwordLogin = await api("POST", "/api/v1/auth/login", { email: "pat@example.com", password: "secret1" });
    check("password login still works after linking", passwordLogin.status === 200, passwordLogin.text);

    // Lookup is by Google's account id, so a changed Google email still works.
    const renamed = await signIn(google.idToken({ sub: "g-pat", email: "pat.new@gmail.com" }));
    check("linked account found by Google id even if the email changed",
      renamed.status === 200 && renamed.json?.user._id === before._id.toString(), renamed.text);

    // Linking keeps an admin an admin (they own the email) and never promotes.
    await api("POST", "/api/v1/auth/register", {
      name: "Boss", email: "boss@example.com", password: "secret1", phone: "1", address: "a", answer: "a",
    });
    await users.updateOne({ email: "boss@example.com" }, { $set: { role: 1 } });
    const boss = await signIn(google.idToken({ sub: "g-boss", email: "boss@example.com" }));
    check("linking keeps the account's role", boss.status === 200 && boss.json?.user.role === 1, boss.text);

    // Legacy account (mixed-case email, plain-text answer) is cleaned up on link.
    await users.insertOne({ name: "Old", email: " Old.User@Example.com ", password: before.password, phone: "1", address: "a", answer: "Tennis", role: 0 });
    const legacy = await signIn(google.idToken({ sub: "g-old", email: "old.user@example.com" }));
    const oldUser = await users.findOne({ googleId: "g-old" });
    check("legacy account linked and upgraded",
      legacy.status === 200 && oldUser?.email === "old.user@example.com" && /^\$2[aby]\$/.test(oldUser.answer),
      `${legacy.text} ${JSON.stringify(oldUser)}`);

    // Two first sign-ins at once make one account.
    const pair = await Promise.all([
      signIn(google.idToken({ sub: "g-race", email: "race@gmail.com" })),
      signIn(google.idToken({ sub: "g-race", email: "race@gmail.com" })),
    ]);
    check("simultaneous first sign-ins both succeed",
      pair.every((r) => r.status === 200 || r.status === 201), pair.map((r) => r.status).join());
    check("and create one account", (await users.countDocuments({ googleId: "g-race" })) === 1);

    // Rejected tokens. None of these may sign anyone in.
    await rejected("missing credential -> 400", 400);
    await rejected("non-string credential -> 400", 400, { token: "x" });
    await rejected("garbage credential -> 401", 401, "not-a-jwt");
    await rejected("token for another app (wrong audience) -> 401", 401,
      google.idToken({ aud: "someone-else.apps.googleusercontent.com" }));
    await rejected("expired token -> 401", 401, google.idToken({ iat: now() - 7200, exp: now() - 3600 }));
    await rejected("token signed with a key Google didn't publish -> 401", 401,
      google.idToken({ sub: "g-forged", email: "pat@example.com", privateKey: google.forgedKey }));
    await rejected("unverified email -> 401", 401, google.idToken({ sub: "g-unv", email: "unverified@gmail.com", email_verified: false }));
    await rejected("wrong issuer -> 401", 401, google.idToken({ iss: "https://evil.example.com" }));
    check("forged and unverified tokens created no accounts",
      !(await users.findOne({ googleId: { $in: ["g-forged", "g-unv"] } })) &&
      !(await users.findOne({ email: "unverified@gmail.com" })));
    const conflict = await rejected("email linked to a different Google account -> 409", 409,
      google.idToken({ sub: "g-intruder", email: "pat@example.com" }));
    check("409 says to use the password", /password/i.test(conflict.json?.message || ""));
    check("Pat's link unchanged", (await users.findOne({ email: "pat@example.com" })).googleId === "g-pat");

    check("Google's keys fetched once and cached", google.state.certRequests === 1, String(google.state.certRequests));

    // Limiter: successful sign-ins never count; failure 11 is blocked.
    check(`counted ${failures} rejected attempts`, failures === 9);
    const tenth = await signIn("still-not-a-jwt");
    const eleventh = await signIn(google.idToken({ sub: "g-new", email: "new.user@gmail.com" }));
    check("10th rejected attempt still answered, then even a valid token -> 429",
      tenth.status === 401 && eleventh.status === 429 && /Too many attempts/.test(eleventh.json?.message || ""),
      `${tenth.status} ${eleventh.status}`);
    const passwordRoute = await api("POST", "/api/v1/auth/login", { email: "pat@example.com", password: "secret1" });
    check("password login has its own limit", passwordRoute.status === 200, passwordRoute.text);
  }, { env: googleEnv(google) });
} finally {
  await google.close();
}

// Without GOOGLE_CLIENT_ID the route is switched off.
await withServer(async ({ api }) => {
  const r = await api("POST", "/api/v1/auth/google", { credential: "anything" });
  check("not configured -> 503", r.status === 503 && r.json?.success === false, r.text);
}, { port: 8098 });

// Configured, but Google's keys can't be fetched: a generic server error.
await withServer(async ({ api }) => {
  const r = await api("POST", "/api/v1/auth/google", { credential: "a.b.c" });
  check("keys unreachable -> 500 with a generic message",
    r.status === 500 && r.json?.message === "Error in Google sign-in" && !/certificates|ECONNREFUSED/i.test(r.text), r.text);
}, { port: 8097, env: { GOOGLE_CLIENT_ID: CLIENT_ID } });
