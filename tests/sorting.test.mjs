// "Sort by" on the product list and the filtered list.
import { withServer, check, ObjectId } from "./harness.mjs";

await withServer(async ({ api, db }) => {
  const cat = new ObjectId();
  const other = new ObjectId();
  const day = (n) => new Date(Date.UTC(2026, 0, n));
  // name, price, ratingAverage, ratingCount, created day, category
  const rows = [
    ["A", 300, 4.5, 2, 1, cat],
    ["B", 100, 0, 0, 2, cat], // never reviewed: no rating fields at all
    ["C", 200, 4.5, 9, 3, cat],
    ["D", 100, 3, 1, 4, cat],
    ["E", 50, 5, 1, 5, other],
    ["F", 400, 2, 4, 6, cat],
    ["G", 250, 4, 3, 7, cat],
  ];
  await db.collection("products").insertMany(rows.map(([name, price, ratingAverage, ratingCount, created, category]) => ({
    name, slug: name.toLowerCase(), description: "d", price, category, quantity: 1, createdAt: day(created),
    ...(ratingCount ? { ratingAverage, ratingCount } : {}),
  })));

  const names = (r) => (r.json?.products || []).map((p) => p.name).join("");
  const list = async (sort, perPage = 48) => {
    const r = await api("GET", `/api/v1/product/product-list/1?perPage=${perPage}${sort ? `&sort=${sort}` : ""}`);
    return names(r);
  };

  check("default is newest first", (await list()) === "GFEDCBA");
  check("newest", (await list("newest")) === "GFEDCBA");
  check("price low to high (ties stable)", (await list("price_asc")) === "EBDCGAF", await list("price_asc"));
  check("price high to low", (await list("price_desc")) === "FAGCDBE", await list("price_desc"));
  check("highest rated, more reviews first on a tie, unrated last", (await list("rating")) === "ECAGDFB", await list("rating"));

  // Paging through a sort returns every product exactly once.
  let paged = "";
  for (let page = 1; page <= 4; page++) {
    const r = await api("GET", `/api/v1/product/product-list/${page}?perPage=2&sort=price_asc`);
    paged += names(r);
  }
  check("paging a sort never repeats or skips", paged === "EBDCGAF", paged);

  for (const bad of ["cheapest", "constructor", "__proto__", "toString"]) {
    const r = await api("GET", `/api/v1/product/product-list/1?sort=${bad}`);
    check(`unknown sort "${bad}" -> 400`, r.status === 400, r.text);
  }
  const twice = await api("GET", "/api/v1/product/product-list/1?sort=rating&sort=newest");
  check("repeated sort parameter -> 400", twice.status === 400, twice.text);

  // Filters take the same choices.
  const filtered = (body) => api("POST", "/api/v1/product/product-filters", body);
  const f1 = await filtered({ checked: [cat.toString()], radio: [100, 300], sort: "price_desc" });
  check("filters + price high to low", names(f1) === "GCDB", names(f1));
  const f2 = await filtered({ checked: [], radio: [0, 1000], sort: "rating" });
  check("filters + highest rated", names(f2) === "ECAGDFB", names(f2));
  const f3 = await filtered({ checked: [cat.toString()], radio: [] });
  check("filters default to newest", names(f3) === "GFDCBA", names(f3));
  const f4 = await filtered({ checked: [], radio: [], sort: { $gt: "" } });
  check("filters reject a non-string sort", f4.status === 400, f4.text);
});
