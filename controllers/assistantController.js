import mongoose from "mongoose";
import categoryModel from "../models/categoryModel.js";
import productModel from "../models/productModel.js";
import { plainText } from "../helpers/plainText.js";
import {
  MAX_MESSAGE_LENGTH,
  parseQuery,
  resolveFilters,
  sanitizeFilters,
} from "../helpers/shoppingQuery.js";
import { findCandidates } from "../helpers/assistantSearch.js";
import { aiAnswer, MAX_PICKS, sanitizeHistory, smartAnswer } from "../helpers/assistantAnswer.js";

// How many candidate products the AI chooses from.
const AI_CANDIDATES = 25;

// POST /chat  { message, history?, context? }
//   history  earlier turns [{ role: "user" | "assistant", text }], for the AI
//   context  what the previous answer returned ({ filters, productIds }), so
//            "show cheaper ones" refines it; checked again here
// Answers { reply, products (each with a reason), mode: "ai" | "smart_search",
// provider (AI label, when mode is ai), fallback (why smart search answered),
// context }. Nothing about the shopper's account is ever sent to the AI.
export const assistantChatController = async (req, res) => {
  try {
    const { message, history, context } = req.body || {};
    const text = typeof message === "string" ? plainText(message) : "";
    if (!text) {
      return res.status(400).send({ success: false, message: "Type what you're looking for." });
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).send({
        success: false,
        message: `Please keep your message under ${MAX_MESSAGE_LENGTH} characters.`,
      });
    }

    const previous = sanitizeFilters(context?.filters);
    const shownIds = (Array.isArray(context?.productIds) ? context.productIds : [])
      .filter((id) => typeof id === "string" && mongoose.isValidObjectId(id))
      .slice(0, MAX_PICKS * 2);
    const [categories, shown] = await Promise.all([
      categoryModel.find().select("name").lean(),
      previous && shownIds.length
        ? productModel.find({ _id: { $in: shownIds } }).select("price").lean()
        : [],
    ]);

    const parsed = parseQuery(text, categories);
    const { filters, refine, excludeShown } = resolveFilters(parsed, previous, shown.map((p) => p.price));
    const { products: candidates, relaxed } = await findCandidates(filters, {
      exclude: excludeShown ? shownIds : [],
      limit: AI_CANDIDATES,
      // A refinement ("cheaper ones") with no results says so, rather than
      // showing unrelated products.
      relax: !refine,
    });
    // Nothing to go on yet ("hi"): popular picks and a nudge.
    const vague =
      !refine &&
      !filters.terms.length &&
      [filters.minPrice, filters.maxPrice, filters.minRating, filters.gender].every((v) => v === null) &&
      filters.sort === "relevance";
    const input = { message: text, history: sanitizeHistory(history), filters, candidates, relaxed, vague, refine, lang: parsed.language };

    let answer = null;
    let fallback = "no_matches";
    if (candidates.length) {
      try {
        answer = await aiAnswer(input);
      } catch (error) {
        fallback = error.reason || "failed";
        if (fallback !== "off") console.log(`Shopping assistant: smart search instead of AI (${error.message})`);
      }
    }

    const { reply, products, provider } = answer || smartAnswer(input);
    res.status(200).send({
      success: true,
      mode: answer ? "ai" : "smart_search",
      provider: provider?.label || null,
      fallback: answer ? null : fallback,
      reply,
      products,
      context: { filters, productIds: products.map((p) => String(p._id)) },
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "The assistant couldn't answer right now." });
  }
};
