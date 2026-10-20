// Rule-based understanding of shopping requests, for the shopping assistant.
// It always runs: its filters pick the candidate products the AI chooses from,
// and when the AI is off or fails, it answers on its own (smart search).
//
// parseQuery("gift under ₹2000 for my dad who likes cricket", categories)
//   -> { maxPrice: 2000, gender: "men", terms: [["cricket"]], ... }
// English, Hindi (Devanagari) and Hinglish (Hindi in Latin letters) work:
// "2000 se kam ka phone", "सस्ता फोन दिखाओ".
import mongoose from "mongoose";

export const MAX_MESSAGE_LENGTH = 300;
export const ASSISTANT_SORTS = ["relevance", "rating", "price_asc", "price_desc"];
const MAX_TERMS = 6;

// Lower case, NFKC, ASCII digits, no thousands separators, "₹" as a word.
export const normalizeText = (text) =>
  String(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966))
    .replace(/(\d),(?=\d)/g, "$1")
    .replace(/₹/g, " rs ")
    .replace(/(\d)\s*-\s*(\d)/g, "$1 to $2")
    .replace(/(\d)\s*\+/g, "$1 plus ")
    .replace(/(\d)\s*\/-/g, "$1 rs ");

const tokenize = (text) => normalizeText(text).match(/[\p{L}\p{M}\p{N}]+(?:\.\d+)?/gu) || [];
const words = (list) => new Set(list.split(/\s+/).filter(Boolean).map((w) => normalizeText(w)));

const MULTIPLIERS = new Map([
  ...[...words("k thousand thousands hazar hazaar hajar hazār हज़ार हजार")].map((w) => [w, 1000]),
  ...[...words("lakh lakhs lac lacs लाख")].map((w) => [w, 100000]),
]);
const CURRENCY = words("rs rs. inr rupee rupees rupaye rupaiye rupay रुपये रुपए रुपया रुपयों");
const RATING_UNITS = words("star stars rating ratings rated स्टार रेटिंग");
const CONNECTORS = words("to and till se aur से और");
const MAX_BEFORE = words("under below less within upto up max maximum budget cheaper lower beneath बजट");
const MIN_BEFORE = words("above over more min minimum atleast least from starting costlier pricier");
const MAX_AFTER = words("kam tak andar neeche niche less max under below कम तक अंदर नीचे");
const MIN_AFTER = words("zyada jyada zyaada upar adhik more plus above ज़्यादा ज्यादा ऊपर अधिक");

const CHEAP = words("cheap cheaper cheapest affordable inexpensive lowest sasta sasti saste sastaa kifayati सस्ता सस्ती सस्ते किफायती");
const PRICEY = words("expensive premium luxury luxurious costly pricier priciest costlier mehenga mehnga mehngi mehenge महंगा महंगी महंगे");
const BEST = words("best top rated highest popular recommended accha achha acha achchha acche ache badhiya badiya बढ़िया अच्छा अच्छे अच्छी बेस्ट");
const MORE = words("more other others another else different aur dusre dusra doosre और दूसरे दूसरा");

const MEN = words("dad daddy father papa pappa pitaji husband brother bro bhai bhaiya boyfriend son beta grandfather grandpa dada nana him men man mens male boys boy gents uncle chacha mama पापा पिता पति भाई बेटा आदमी पुरुष");
const WOMEN = words("mom mommy mother maa mummy mumma mata wife sister sis behen bahan didi girlfriend daughter beti grandmother grandma dadi nani her women woman womens female girls girl ladies lady aunt chachi mami माँ मां मम्मी पत्नी बहन बेटी महिला लड़की");

// Words that never describe a product. Price, sort and recipient words are
// handled above and dropped too.
const STOP = words(`
  a an the i me my mine for to of in on at with and or is are am be was who which that this these those
  some any want wants wanted need needs looking look find show give get buy buying bought please pls plz
  suggest recommend recommendation recommendations something thing things item items product products
  one ones can could you your good nice great gift gifts present presents like likes love loves loving
  what help than between price prices priced cost costs around about also too very really new latest ok
  okay hi hello hey thanks thank now only just them it its they their he she his have has should would
  will shall do does did how much many all so as by available stock list options option sale deal deals
  offer offers birthday anniversary occasion diwali rakhi christmas festival enjoys enjoy into fan plays
  play playing someone person people use used using quality worth range type kind sort let lets us we our
  mujhe mere meri mera hamare hamara aap aapke tum tumhare ke ka ki ko liye lie liy se me mein main hai
  hain ho tha thi chahiye chaiye chahie dikhao dikha dikhaiye dikhaye batao bataiye bataye koi kuch kya
  wala wale wali ek bhi jo jise jinhe jinko pasand tak beech sabse thoda bahut tohfa tohfe uphaar
  unke unko uske usko inke inko ye yeh woh vo wo dena dedo lena khareedna kharidna chahta chahti hun hoon
  raha rahi karta karti karte khelna khelte khelta hoga hogi wahi waise jaisa jaise
  मुझे मेरे मेरी मेरा हमारे आप आपके के का की को लिए लिये से में है हैं हो था थी चाहिए दिखाओ दिखाइए दिखाएं
  बताओ बताइए कोई कुछ क्या वाला वाले वाली एक भी जो जिन्हें पसंद बीच सबसे थोड़ा बहुत तोहफा उपहार गिफ्ट
  उन्हें उनके उसके यह ये वह वो देना लेना खरीदना चाहता चाहती हूं हूँ रहा रही करता करती करते खेलना
`);

// Words shoppers use for a product, and what to search for. Each group is a
// list of stems matched anywhere in names, descriptions and category names.
const SYNONYMS = [
  [["phone", "phones", "smartphone", "smartphones", "mobile", "mobiles", "फोन", "फ़ोन", "मोबाइल"], ["phone", "smartphone", "mobile", "iphone"]],
  [["laptop", "laptops", "लैपटॉप"], ["laptop"]],
  [["shoe", "shoes", "sneaker", "sneakers", "footwear", "joote", "joota", "jute", "chappal", "जूते", "जूता", "चप्पल"], ["shoe", "sneaker", "footwear"]],
  [["watch", "watches", "ghadi", "ghari", "घड़ी", "घडी"], ["watch"]],
  [["sunglasses", "sunglass", "goggles", "shades", "chashma", "चश्मा"], ["sunglass", "goggle"]],
  [["perfume", "perfumes", "fragrance", "fragrances", "scent", "itr", "attar", "इत्र", "परफ्यूम"], ["perfume", "fragrance", "scent"]],
  [["bag", "bags", "handbag", "handbags", "purse", "jhola", "बैग", "थैला"], ["bag", "purse"]],
  [["shirt", "shirts", "kameez", "शर्ट", "कमीज़"], ["shirt"]],
  [["dress", "dresses", "frock", "ड्रेस"], ["dress", "frock"]],
  [["jewellery", "jewelry", "jewel", "gehne", "gehna", "गहने", "ज्वेलरी"], ["jewel", "necklace", "earring", "ring"]],
  [["makeup", "cosmetics", "cosmetic", "मेकअप"], ["makeup", "cosmetic", "lipstick", "mascara", "beauty"]],
  [["skincare", "skin"], ["skin"]],
  [["furniture", "फर्नीचर"], ["furniture", "sofa", "chair", "table", "bed"]],
  [["kitchen", "rasoi", "रसोई"], ["kitchen"]],
  [["tablet", "tablets", "tab", "ipad", "टैबलेट"], ["tablet", "ipad"]],
  [["bike", "bikes", "motorcycle", "motorbike", "बाइक"], ["motorcycle", "bike"]],
  [["car", "cars", "gaadi", "gadi", "गाड़ी", "कार"], ["car", "vehicle"]],
  [["cricket", "क्रिकेट"], ["cricket"]],
  [["football", "soccer", "फुटबॉल"], ["football"]],
  [["sports", "sport", "khel", "खेल"], ["sport"]],
  [["earphones", "earphone", "headphones", "headphone", "earbuds", "earbud", "headset"], ["earphone", "headphone", "earbud", "headset", "airpod"]],
  [["book", "books", "kitab", "kitaab", "किताब"], ["book"]],
  [["toy", "toys", "khilona", "khilone", "खिलौना", "खिलौने"], ["toy"]],
  [["accessories", "accessory"], ["accessor"]],
].flatMap(([spoken, stems]) => spoken.map((word) => [normalizeText(word), stems]));
const SYNONYM_MAP = new Map(SYNONYMS);

// "watches" -> "watch", "shoes" -> "shoe", "accessories" -> "accessor".
export const stem = (word) => {
  if (!/^[a-z]+$/.test(word) || word.length <= 3) return word;
  if (word.endsWith("ies")) return word.slice(0, -3);
  if (/(ch|sh|x|ss|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
};

const HINGLISH = words("chahiye chaiye chahie dikhao dikhaiye batao bataiye mujhe liye sasta sasti saste wala wale wali hai hain kam tak koi kuch accha achha acha mehenga hazar hazaar kya mere meri mera aur bhi ke ka ki");
// "hi" for Devanagari, "hinglish" for Hindi in Latin letters, else "en".
export const detectLanguage = (text) => {
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  const hits = tokenize(text).filter((t) => HINGLISH.has(t)).length;
  return hits >= 2 ? "hinglish" : "en";
};

// Amounts in the message: { value, start, end, currency } (token positions).
const findAmounts = (tokens) => {
  const amounts = [];
  for (let i = 0; i < tokens.length; i++) {
    const m = tokens[i].match(/^(\d+(?:\.\d+)?)(k|l|lakh|lac)?$/);
    if (!m) continue;
    let value = Number(m[1]);
    let end = i;
    if (m[2]) value *= m[2] === "k" ? 1000 : 100000;
    else if (MULTIPLIERS.has(tokens[i + 1])) value *= MULTIPLIERS.get(tokens[++end]);
    const currency = CURRENCY.has(tokens[i - 1]) || CURRENCY.has(tokens[end + 1]);
    amounts.push({ value, start: i, end, currency });
  }
  return amounts;
};

// Reads a shopping request. `categories` is [{ _id, name }], the store's
// categories. Returns the filters it found plus hints for replies.
export const parseQuery = (message, categories = []) => {
  const tokens = tokenize(message);
  const used = new Set();
  const result = {
    minPrice: null,
    maxPrice: null,
    minRating: null,
    sort: null,
    gender: null,
    terms: [],
    categoryIds: [],
    followUp: null,
    language: detectLanguage(message),
  };

  // Ratings first ("4 star", "4+ rating"), so they aren't read as prices.
  const amounts = [];
  for (const amount of findAmounts(tokens)) {
    let next = amount.end + 1;
    if (tokens[next] === "plus") next++;
    if (!amount.currency && amount.value <= 5 && RATING_UNITS.has(tokens[next])) {
      result.minRating = amount.value;
      for (let i = amount.start; i <= next; i++) used.add(i);
    } else {
      amounts.push(amount);
    }
  }

  // Price ranges ("1000 to 2000", "1000 se 2000 tak"), then single limits.
  const maxes = [];
  const mins = [];
  for (let i = 0; i < amounts.length; i++) {
    const a = amounts[i];
    const b = amounts[i + 1];
    if (b && b.start - a.end === 2 && CONNECTORS.has(tokens[a.end + 1]) && a.value < b.value) {
      mins.push(a.value);
      maxes.push(b.value);
      for (let t = a.start; t <= b.end; t++) used.add(t);
      i++;
      continue;
    }
    for (let t = a.start; t <= a.end; t++) used.add(t);
    const before = tokens.slice(Math.max(0, a.start - 3), a.start).reverse();
    const after = tokens.slice(a.end + 1, a.end + 4);
    const cue = (list, maxWords, minWords) => {
      for (const word of list) {
        if (maxWords.has(word)) return "max";
        if (minWords.has(word)) return "min";
      }
      return null;
    };
    const kind = cue(before, MAX_BEFORE, MIN_BEFORE) || cue(after, MAX_AFTER, MIN_AFTER);
    if (kind === "min") mins.push(a.value);
    // A bare amount is a budget, unless it's small enough to be a model
    // number ("iphone 13").
    else if (kind === "max" || a.currency || a.value >= 100) maxes.push(a.value);
  }
  if (maxes.length) result.maxPrice = Math.min(...maxes);
  if (mins.length) result.minPrice = Math.max(...mins);
  if (result.minPrice !== null && result.maxPrice !== null && result.minPrice > result.maxPrice) {
    result.minPrice = null;
  }

  const has = (set) => tokens.some((t) => set.has(t));
  const text = ` ${tokens.join(" ")} `;
  if (/ (more|less) (expensive|costly|pricey) /.test(text) || / (lower|kam|higher|zyada) (price|daam|dam|keemat) /.test(text)) {
    result.followUp = /( more | higher | zyada )/.test(text) ? "pricier" : "cheaper";
  } else if (has(words("cheaper sasta sasti saste सस्ता सस्ते सस्ती"))) {
    result.followUp = "cheaper";
  } else if (has(words("pricier costlier premium mehenga mehnga महंगा महंगे"))) {
    result.followUp = "pricier";
  } else if (has(MORE) && !amounts.length) {
    result.followUp = "more";
  }

  // "budget phone" means cheap; "budget 5000" is just a limit.
  const budgetPhrase = tokens.includes("budget") && !amounts.length;
  if (result.followUp === "cheaper" || has(CHEAP) || budgetPhrase) result.sort = "price_asc";
  else if (result.followUp === "pricier" || has(PRICEY)) result.sort = "price_desc";
  else if (has(BEST) || result.minRating) result.sort = "rating";

  if (has(MEN) && !has(WOMEN)) result.gender = "men";
  else if (has(WOMEN) && !has(MEN)) result.gender = "women";

  // Product words: everything that isn't a number, price/sort cue, recipient
  // or stop word, with known words mapped to what to search for.
  const ignore = [CURRENCY, RATING_UNITS, CONNECTORS, MAX_BEFORE, MIN_BEFORE, MAX_AFTER, MIN_AFTER, CHEAP, PRICEY, BEST, MORE, MEN, WOMEN, STOP];
  const seen = new Set();
  tokens.forEach((token, i) => {
    if (used.has(i) || /^\d/.test(token) || MULTIPLIERS.has(token)) return;
    if (ignore.some((set) => set.has(token))) return;
    const stems = SYNONYM_MAP.get(token) || (token.length >= 3 ? [stem(token)] : null);
    if (!stems) return;
    const key = stems.join("|");
    if (seen.has(key) || result.terms.length >= MAX_TERMS) return;
    seen.add(key);
    result.terms.push(stems);
  });

  result.categoryIds = matchCategories(categories, result.terms);
  return result;
};

const categoryWords = (name) => tokenize(name).map(stem);
const GENDER_WORDS = { men: new Set(["men", "mens", "man", "male"]), women: new Set(["women", "womens", "woman", "female", "ladies"]) };
export const categoryGender = (name) => {
  const ws = tokenize(name);
  if (ws.some((w) => GENDER_WORDS.women.has(w))) return "women";
  if (ws.some((w) => GENDER_WORDS.men.has(w))) return "men";
  return null;
};

// Does a category-name word fit a search stem? From the start of the word:
// "Mobiles" fits "mobile", "Headphones" doesn't fit "phone".
const fits = (word, s) => s.length >= 3 && word.length >= 3 && (word.startsWith(s) || s.startsWith(word));

// Categories whose name fits a product word. "Accessories" categories only
// match when the shopper asks for accessories, so "phone" means phones, not
// phone cases.
export const matchCategories = (categories, terms) => {
  const stems = terms.flat();
  const wantsAccessories = stems.some((s) => s.startsWith("accessor"));
  return categories
    .filter((category) => {
      const ws = categoryWords(category.name).filter((w) => !GENDER_WORDS.men.has(w) && !GENDER_WORDS.women.has(w));
      if (!wantsAccessories && ws.some((w) => w.startsWith("accessor"))) return false;
      return ws.some((w) => stems.some((s) => fits(w, s)));
    })
    .map((category) => String(category._id));
};

// Filters carried between turns (sent back by the browser, so checked again
// on every request): see resolveFilters.
const amountOrNull = (value) => (Number.isFinite(value) && value >= 0 && value <= 1e9 ? value : null);
export const sanitizeFilters = (filters) => {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return null;
  const terms = Array.isArray(filters.terms)
    ? filters.terms
        .filter((group) => Array.isArray(group) && group.length > 0 && group.length <= 8)
        .map((group) => group.filter((s) => typeof s === "string" && s.length <= 30 && /^[\p{L}\p{M}\p{N}]+$/u.test(s)))
        .filter((group) => group.length > 0)
        .slice(0, MAX_TERMS)
    : [];
  const minRating = amountOrNull(filters.minRating);
  return {
    minPrice: amountOrNull(filters.minPrice),
    maxPrice: amountOrNull(filters.maxPrice),
    belowPrice: amountOrNull(filters.belowPrice),
    abovePrice: amountOrNull(filters.abovePrice),
    minRating: minRating !== null && minRating <= 5 ? minRating : null,
    sort: ASSISTANT_SORTS.includes(filters.sort) ? filters.sort : "relevance",
    gender: ["men", "women"].includes(filters.gender) ? filters.gender : null,
    terms,
    categoryIds: Array.isArray(filters.categoryIds)
      ? filters.categoryIds.filter((id) => typeof id === "string" && mongoose.isValidObjectId(id)).slice(0, 20)
      : [],
  };
};

// The filters for this turn. A message without product words ("show cheaper
// ones", "under 1000", "best rated?") refines the previous search; one with
// product words starts a new search. `shownPrices` are the current prices of
// the products shown last time (read from the database, not the browser).
export const resolveFilters = (parsed, previous, shownPrices = []) => {
  const refine = Boolean(previous) && parsed.terms.length === 0 && parsed.categoryIds.length === 0;
  const base = refine
    ? { ...previous }
    : { minPrice: null, maxPrice: null, belowPrice: null, abovePrice: null, minRating: null, sort: "relevance", gender: null, terms: parsed.terms, categoryIds: parsed.categoryIds };
  const filters = {
    ...base,
    minPrice: parsed.minPrice ?? base.minPrice,
    maxPrice: parsed.maxPrice ?? base.maxPrice,
    minRating: parsed.minRating ?? base.minRating,
    sort: parsed.sort || base.sort,
    gender: parsed.gender || base.gender,
  };
  if (parsed.minPrice !== null || parsed.maxPrice !== null) {
    filters.belowPrice = null;
    filters.abovePrice = null;
  }
  let excludeShown = false;
  if (refine && shownPrices.length) {
    // Cheaper than everything shown (and any lower limit no longer applies),
    // or pricier than everything shown.
    if (parsed.followUp === "cheaper" && parsed.maxPrice === null) {
      Object.assign(filters, { belowPrice: Math.min(...shownPrices), minPrice: null, abovePrice: null });
    } else if (parsed.followUp === "pricier" && parsed.minPrice === null) {
      Object.assign(filters, { abovePrice: Math.max(...shownPrices), maxPrice: null, belowPrice: null });
    } else if (parsed.followUp === "more") {
      excludeShown = true;
    }
  }
  return { filters, refine, excludeShown };
};
