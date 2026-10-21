// Finds the in-stock products that fit the shopping assistant's filters
// (helpers/shoppingQuery.js) and ranks them. These are the only products the
// assistant can ever show: the AI only picks from them.
import categoryModel from "../models/categoryModel.js";
import productModel from "../models/productModel.js";
import { escapeRegex } from "./escapeRegex.js";
import { categoryGender, isAccessoryCategory } from "./shoppingQuery.js";

const FIELDS = "name slug description price quantity category images ratingAverage ratingCount";
const SCAN_LIMIT = 300;

const priceFilter = (f) => {
  const price = {};
  if (f.minPrice !== null) price.$gte = f.minPrice;
  if (f.maxPrice !== null) price.$lte = f.maxPrice;
  if (f.belowPrice !== null) price.$lt = f.belowPrice;
  if (f.abovePrice !== null) price.$gt = f.abovePrice;
  return Object.keys(price).length ? { price } : {};
};

const byRating = (a, b) =>
  (b.ratingAverage || 0) - (a.ratingAverage || 0) || (b.ratingCount || 0) - (a.ratingCount || 0) || String(b._id).localeCompare(String(a._id));
const ORDER = {
  relevance: (a, b) => b.score - a.score || byRating(a, b),
  rating: byRating,
  price_asc: (a, b) => a.price - b.price || byRating(a, b),
  price_desc: (a, b) => b.price - a.price || byRating(a, b),
};
const MONGO_SORT = {
  relevance: { ratingAverage: -1, ratingCount: -1, _id: -1 },
  rating: { ratingAverage: -1, ratingCount: -1, _id: -1 },
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: -1 },
};

// Product words match from the start of a word, so "phone" finds "Phones"
// but not "headphones" (Latin script only: \b doesn't work for Devanagari,
// which is matched anywhere).
const wordStart = (stem) => (/^[a-z0-9]/.test(stem) ? `\\b${escapeRegex(stem)}` : escapeRegex(stem));
const matcher = (group) => new RegExp(group.map(wordStart).join("|"), "i");

// How well a product fits: `groups` is how many of the shopper's product
// words it matches, `strong` how many of those are in its name or category
// (not just its description); `score` orders equally good matches. The
// shopper's recipient (dad, mom) favours that gender's categories.
const scoreProduct = (product, filters, categoryIds) => {
  const name = product.name.toLowerCase();
  const description = (product.description || "").toLowerCase();
  const category = product.category?.name?.toLowerCase() || "";
  const matched = [];
  let score = 0;
  let strong = 0;
  for (const group of filters.terms) {
    const re = matcher(group);
    const inName = re.test(name);
    const inCategory = re.test(category);
    if (inName) score += 3;
    else if (inCategory) score += 2;
    else if (re.test(description)) score += 1;
    else continue;
    if (inName || inCategory) strong++;
    matched.push(group[0]);
  }
  if (categoryIds.has(String(product.category?._id))) score += 2;
  // From the category ("Mens Shoes") or else the name ("Women's Wrist Watch").
  const gender = categoryGender(category) || categoryGender(name);
  const otherGender = Boolean(filters.gender && gender && gender !== filters.gender);
  if (filters.gender && gender === filters.gender) score += 1.5;
  return { score, strong, groups: matched.length, matched, otherGender, accessory: category.includes("accessor") };
};

// Product words that ask for accessories ("phone case", "watch strap").
const ACCESSORY_WORDS = /^(accessor|case|cover|charger|cable|holder|stand|strap|protector|adapter|mount|ball|glove|pad|grip|bottle)/;

// Drops weaker matches, but only when better ones are left.
const keepIf = (products, test) => (products.some(test) ? products.filter(test) : products);
const closestMatches = (products, dropAccessories) => {
  const most = Math.max(0, ...products.map((p) => p.groups));
  let kept = products.filter((p) => p.groups === most && p.groups > 0);
  // Words in the name or category beat words only in the description.
  kept = keepIf(kept, (p) => p.strong > 0);
  // "phone" means phones (it matched the Smartphones category), never phone
  // cases, unless accessories are asked for.
  if (dropAccessories) kept = kept.filter((p) => !p.accessory);
  return keepIf(kept, (p) => !p.otherGender);
};

// Up to `limit` products, taking each category's best in turn, so a request
// without product words ("gift for my mom") offers a mix of categories rather
// than whichever few were added last.
const acrossCategories = (products, limit) => {
  const groups = new Map();
  for (const p of products) {
    const key = String(p.category?._id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const lists = [...groups.values()];
  const picked = [];
  for (let i = 0; picked.length < limit && picked.length < products.length; i++) {
    for (const list of lists) if (i < list.length && picked.length < limit) picked.push(list[i]);
  }
  return picked;
};

// Returns { products, relaxed } with each product's `score` and `matched`
// words. When nothing fits and `relax` is true:
//   relaxed "price"  products that match the words, at the prices closest to
//                    the shopper's limits (the reply says so);
//   relaxed "words"  else the best products within the price limits.
export const findCandidates = async (filters, { exclude = [], limit = 30, relax = true } = {}) => {
  const anyPrice = { quantity: { $gt: 0 } };
  if (filters.minRating !== null) anyPrice.ratingAverage = { $gte: filters.minRating };
  if (exclude.length) anyPrice._id = { $nin: exclude };
  const base = { ...anyPrice, ...priceFilter(filters) };

  const categoryIds = new Set(filters.categoryIds);
  const or = [];
  if (categoryIds.size) or.push({ category: { $in: [...categoryIds] } });
  for (const stem of filters.terms.flat()) {
    const regex = { $regex: wordStart(stem), $options: "i" };
    or.push({ name: regex }, { description: regex });
  }

  const run = async (query, sort) => {
    const docs = await productModel
      .find(query)
      .select(FIELDS)
      .populate("category", "name slug")
      .sort(sort)
      .limit(SCAN_LIMIT)
      .lean();
    return docs.map((doc) => ({ ...doc, ...scoreProduct(doc, filters, categoryIds) }));
  };

  let relaxed = null;
  let products = [];
  let order = ORDER[filters.sort] || ORDER.relevance;
  if (or.length) {
    const wantsAccessories = filters.terms.flat().some((s) => ACCESSORY_WORDS.test(s));
    // Only when the words fit a real (non-accessories) category: "kitchen"
    // matches only "Kitchen Accessories", and those are what to show.
    const matchedCategories = categoryIds.size
      ? await categoryModel.find({ _id: { $in: [...categoryIds] } }).select("name").lean()
      : [];
    const dropAccessories = !wantsAccessories && matchedCategories.some((c) => !isAccessoryCategory(c.name));
    const matching = async (query) =>
      closestMatches(await run({ ...query, $or: or }, MONGO_SORT.relevance), dropAccessories);
    products = await matching(base);
    if (!products.length && relax && Object.keys(priceFilter(filters)).length) {
      products = await matching(anyPrice);
      if (products.length) {
        relaxed = "price";
        // Closest to the limit first: cheapest above a maximum, dearest below a minimum.
        const overMax = filters.maxPrice !== null || filters.belowPrice !== null;
        order = overMax ? ORDER.price_asc : ORDER.price_desc;
      }
    }
    if (!products.length && relax) relaxed = "words";
  }
  if (!or.length || relaxed === "words") {
    products = await run(base, MONGO_SORT[filters.sort] || MONGO_SORT.relevance);
    products = keepIf(products, (p) => !p.otherGender);
    if (filters.sort === "relevance") products = acrossCategories(products.sort(order), limit);
  }

  products.sort(order);
  return { products: products.slice(0, limit), relaxed };
};
