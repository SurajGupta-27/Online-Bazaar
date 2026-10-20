// Reviews and ratings: only customers with a delivered order may review, one
// review per product, text stored as plain text, product averages kept in step.
import { withServer, check, ObjectId } from "./harness.mjs";
import { adminSetup } from "./fixtures.mjs";

const leaksNothing = (r) => r && !("user" in r) && !("email" in r) && !JSON.stringify(r).includes("@");

await withServer(async ({ api, db }) => {
  const { token: admin } = await adminSetup(api, db);
  const products = db.collection("products");
  const orders = db.collection("orders");
  const users = db.collection("users");

  const signUp = async (name) => {
    const email = `${name}@x.com`;
    await api("POST", "/api/v1/auth/register", { name, email, password: "secret1", phone: "1", address: "a", answer: "a" });
    const { json } = await api("POST", "/api/v1/auth/login", { email, password: "secret1" });
    return { token: json.token, id: (await users.findOne({ email }))._id };
  };
  const [buyer, buyer2, waiting, stranger, spammer] = await Promise.all(
    ["buyer", "buyer2", "waiting", "stranger", "spammer"].map(signUp)
  );

  const pen = new ObjectId();
  const ink = new ObjectId();
  const cat = new ObjectId();
  await products.insertMany([
    { _id: pen, name: "Pen", slug: "pen", description: "d", price: 10, category: cat, quantity: 5, createdAt: new Date() },
    { _id: ink, name: "Ink", slug: "ink", description: "d", price: 5, category: cat, quantity: 5, createdAt: new Date() },
  ]);
  const order = (user, status, product = pen) => ({
    user: user.id, items: [{ product, name: "x", price: 10, quantity: 1 }], total: 10,
    shippingAddress: "a", status, paymentMethod: "cod", paymentStatus: "pending",
  });
  await orders.insertMany([
    order(buyer, "delivered"),
    order(buyer2, "delivered"),
    order(waiting, "shipped"),
    order(spammer, "delivered"),
    order(stranger, "delivered", ink), // delivered, but a different product
  ]);

  const review = (user, body, pid = pen) => api("POST", `/api/v1/review/product/${pid}`, body, { token: user.token });
  const good = { rating: 4, comment: "Writes smoothly and the ink lasts." };

  // Empty product.
  const empty = await api("GET", `/api/v1/review/product/${pen}`);
  check("no reviews yet: zero summary", empty.status === 200 && empty.json.summary.count === 0 &&
    empty.json.summary.average === 0 && empty.json.summary.breakdown["5"] === 0 && empty.json.reviews.length === 0, empty.text);
  check("unknown or invalid product -> 404",
    (await api("GET", `/api/v1/review/product/${new ObjectId()}`)).status === 404 &&
    (await api("GET", "/api/v1/review/product/not-an-id")).status === 404);

  // Who may review.
  check("logged out -> 401", (await api("POST", `/api/v1/review/product/${pen}`, good)).status === 401);
  const notBought = await review(stranger, good);
  check("never received this product -> 403", notBought.status === 403, notBought.text);
  const notDelivered = await review(waiting, good);
  check("order not delivered yet -> 403", notDelivered.status === 403, notDelivered.text);
  const waitingMine = await api("GET", `/api/v1/review/product/${pen}/mine`, null, { token: waiting.token });
  check("'mine' says a not-yet-delivered buyer can't review",
    waitingMine.json?.canReview === false && waitingMine.json?.review === null, waitingMine.text);
  const buyerMine = await api("GET", `/api/v1/review/product/${pen}/mine`, null, { token: buyer.token });
  check("'mine' says a delivered buyer can review", buyerMine.json?.canReview === true, buyerMine.text);

  // Validation runs before the purchase check. The limit is 10 writes per
  // account per hour: stranger uses 8 in this file, buyer 5.
  for (const [label, body] of [
    ["rating 0", { ...good, rating: 0 }],
    ["rating 6", { ...good, rating: 6 }],
    ["rating 4.5", { ...good, rating: 4.5 }],
    ["rating 'abc'", { ...good, rating: "abc" }],
    ["comment too short", { rating: 4, comment: "  ok <b></b> " }],
    ["comment too long", { rating: 4, comment: "a".repeat(1001) }],
  ]) {
    const r = await review(stranger, body);
    check(`${label} -> 400`, r.status === 400 && r.json?.success === false, r.text);
  }

  // A good review, with HTML stripped.
  const created = await review(buyer, {
    rating: "5",
    comment: '  <script>alert("x")</script>Great <b>pen</b>,\r\n\r\n\r\n\r\nwrites <img src=x onerror=alert(1)>well.  ',
  });
  check("verified buyer's review -> 201", created.status === 201, created.text);
  check("stored as plain text", created.json?.review.comment === "Great pen,\n\nwrites well.", JSON.stringify(created.json?.review.comment));
  check("marked Verified Purchase", created.json?.review.verified === true);
  check("shows the reviewer's name only", created.json?.review.name === "buyer" && leaksNothing(created.json?.review), JSON.stringify(created.json?.review));
  const stored = await db.collection("reviews").findOne({ user: buyer.id });
  check("no HTML in the database", stored && !/[<>]/.test(stored.comment) && stored.rating === 5);

  const dup = await review(buyer, good);
  check("second review of the same product -> 409", dup.status === 409, dup.text);

  await review(buyer2, { rating: 2, comment: "Leaked in my bag after a week." });
  let p = await products.findOne({ _id: pen });
  check("product average and count updated", p.ratingAverage === 3.5 && p.ratingCount === 2, `${p.ratingAverage} ${p.ratingCount}`);
  const list = await api("GET", `/api/v1/review/product/${pen}`);
  check("summary with breakdown", list.json?.summary.average === 3.5 && list.json.summary.count === 2 &&
    list.json.summary.breakdown["5"] === 1 && list.json.summary.breakdown["2"] === 1 && list.json.summary.breakdown["4"] === 0, JSON.stringify(list.json?.summary));
  check("newest first, no emails or user ids", list.json.reviews.map((r) => r.name).join() === "buyer2,buyer" &&
    list.json.reviews.every(leaksNothing), JSON.stringify(list.json.reviews));
  const card = await api("GET", "/api/v1/product/get-product/pen");
  check("product page data includes the rating", card.json?.product.ratingAverage === 3.5 && card.json.product.ratingCount === 2);

  // Editing.
  const mine = created.json.review._id;
  const edited = await api("PUT", `/api/v1/review/${mine}`, { rating: 3, comment: "Good pen, <i>but</i> scratchy." }, { token: buyer.token });
  check("author edits own review", edited.status === 200 && edited.json.review.rating === 3 &&
    edited.json.review.comment === "Good pen, but scratchy." && edited.json.review.edited === true, edited.text);
  p = await products.findOne({ _id: pen });
  check("average recalculated after edit", p.ratingAverage === 2.5 && p.ratingCount === 2, `${p.ratingAverage}`);
  const hijack = await api("PUT", `/api/v1/review/${mine}`, { rating: 1, comment: "Someone else's words" }, { token: buyer2.token });
  check("someone else can't edit it (404)", hijack.status === 404, hijack.text);
  const badEdit = await api("PUT", `/api/v1/review/${mine}`, { rating: 9, comment: "Still a fine pen." }, { token: buyer.token });
  check("edit is validated too", badEdit.status === 400, badEdit.text);

  // Deleting.
  const otherDelete = await api("DELETE", `/api/v1/review/${mine}`, null, { token: stranger.token });
  check("a stranger can't delete it (404)", otherDelete.status === 404, otherDelete.text);
  const del = await api("DELETE", `/api/v1/review/${mine}`, null, { token: buyer.token });
  check("author deletes own review", del.status === 200, del.text);
  p = await products.findOne({ _id: pen });
  check("average recalculated after delete", p.ratingAverage === 2 && p.ratingCount === 1, `${p.ratingAverage} ${p.ratingCount}`);
  const again = await review(buyer, good);
  check("can review again after deleting", again.status === 201, again.text);

  // Admin moderation.
  const all = await api("GET", "/api/v1/review/all", null, { token: admin });
  check("admin lists all reviews with product and reviewer email",
    all.status === 200 && all.json.total === 2 && all.json.reviews[0].product?.name === "Pen" &&
    all.json.reviews.some((r) => r.email === "buyer2@x.com"), all.text);
  check("customers can't list all reviews", (await api("GET", "/api/v1/review/all", null, { token: buyer.token })).status === 403);
  const b2Review = all.json.reviews.find((r) => r.email === "buyer2@x.com")._id;
  const modDelete = await api("DELETE", `/api/v1/review/${b2Review}`, null, { token: admin });
  check("admin deletes an inappropriate review", modDelete.status === 200, modDelete.text);
  p = await products.findOne({ _id: pen });
  check("average recalculated after admin delete", p.ratingAverage === 4 && p.ratingCount === 1, `${p.ratingAverage}`);

  // Rate limit: 10 review writes per hour per account (errors count too).
  let firstBlocked = null;
  for (let i = 1; i <= 11 && !firstBlocked; i++) {
    const r = await review(spammer, { rating: 5, comment: "x" });
    if (r.status === 429) firstBlocked = i;
  }
  check("11th review write in an hour -> 429", firstBlocked === 11, String(firstBlocked));
  const others = await review(stranger, good, ink);
  check("other accounts aren't affected", others.status === 201, others.text);

  // Deleting a product deletes its reviews.
  const delProduct = await api("DELETE", `/api/v1/product/delete-product/${ink}`, null, { token: admin });
  check("product deleted", delProduct.status === 200, delProduct.text);
  check("its reviews are gone", (await db.collection("reviews").countDocuments({ product: ink })) === 0);
});
