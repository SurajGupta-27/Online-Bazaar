import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { BsArrowCounterclockwise, BsSend, BsStars, BsXLg } from "react-icons/bs";
import { formatPrice } from "../../utils/formatPrice";
import { productImage } from "../../utils/productImage";
import { errorMessage } from "../../utils/errorMessage";
import { StarRating } from "../Product/StarRating";

// Matches MAX_MESSAGE_LENGTH in helpers/shoppingQuery.js.
export const MAX_MESSAGE_LENGTH = 300;
// Earlier turns sent with each message, for follow-ups ("show cheaper ones").
const HISTORY_TURNS = 6;
const STORAGE_KEY = "bazaar-ai";

const SUGGESTIONS = [
  "Gift under ₹2000 for my dad who likes cricket",
  "Best rated phone under ₹20,000",
  "सस्ता फोन दिखाओ",
];

// Which mode answered, for the small label under each answer.
const FALLBACK_NOTES = {
  off: "AI is switched off",
  limit: "AI is busy right now",
  timeout: "AI took too long",
  failed: "AI couldn't answer",
  no_matches: "Searched the catalogue",
};
export const modeLabel = (answer) =>
  answer.mode === "ai"
    ? { text: `AI${answer.provider ? ` · ${answer.provider}` : ""}`, title: "Picked by AI from our catalogue" }
    : { text: "Smart search", title: FALLBACK_NOTES[answer.fallback] || "Rule-based search" };

// The chat lives in sessionStorage, so it survives moving between pages
// (every page has its own Layout) but not closing the tab.
const load = () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.messages)) return saved;
  } catch {}
  return { open: false, messages: [], context: null };
};
const save = (state) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
};

const ProductPick = ({ product, onPick }) => (
  <li>
    <Link to={`/product/${product.slug}`} className="assistant-pick" onClick={onPick}>
      <img src={productImage(product, 160)} alt="" loading="lazy" />
      <span className="assistant-pick-body">
        <span className="assistant-pick-name">{product.name}</span>
        <span className="assistant-pick-meta">
          <span className="price">{formatPrice(product.price)}</span>
          {product.ratingCount > 0 && (
            <span className="assistant-pick-rating">
              <StarRating value={product.ratingAverage} />
              {Number(product.ratingAverage).toFixed(1)}
            </span>
          )}
        </span>
        {product.reason && <span className="assistant-pick-reason">{product.reason}</span>}
      </span>
    </Link>
  </li>
);

const Message = ({ message, onPick }) => {
  if (message.role === "user") {
    return <div className="assistant-msg from-user">{message.text}</div>;
  }
  if (message.error) {
    return <div className="assistant-msg from-bot is-error" role="alert">{message.text}</div>;
  }
  const label = modeLabel(message);
  return (
    <div className="assistant-msg from-bot">
      <p className="mb-0">{message.text}</p>
      {message.products?.length > 0 && (
        <ul className="assistant-picks">
          {message.products.map((product) => (
            <ProductPick key={product._id} product={product} onPick={onPick} />
          ))}
        </ul>
      )}
      <span className={`assistant-mode ${message.mode === "ai" ? "is-ai" : ""}`} title={label.title}>
        {label.text}
        <span className="visually-hidden">: {label.title}</span>
      </span>
    </div>
  );
};

// The floating "Ask Bazaar AI" button and chat panel, on every page (Layout).
const ShoppingAssistant = () => {
  const [state, setState] = useState(load);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const endRef = useRef(null);
  const launcherRef = useRef(null);
  const { open, messages } = state;

  useEffect(() => save(state), [state]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, busy, open]);

  const setOpen = (value) => {
    setState((s) => ({ ...s, open: value }));
    if (!value) setTimeout(() => launcherRef.current?.focus(), 0);
  };

  const send = async (text) => {
    const message = text.trim();
    if (!message || busy || message.length > MAX_MESSAGE_LENGTH) return;
    const history = messages
      .filter((m) => !m.error)
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, text: m.text }));
    setState((s) => ({ ...s, messages: [...s.messages, { role: "user", text: message }] }));
    setDraft("");
    setBusy(true);
    try {
      const { data } = await axios.post("/api/v1/assistant/chat", {
        message,
        history,
        context: state.context,
      });
      const answer = {
        role: "assistant",
        text: data.reply,
        products: data.products || [],
        mode: data.mode,
        provider: data.provider,
        fallback: data.fallback,
      };
      setState((s) => ({ ...s, messages: [...s.messages, answer], context: data.context || null }));
    } catch (error) {
      const text = errorMessage(error, "The assistant couldn't answer. Please try again.");
      setState((s) => ({ ...s, messages: [...s.messages, { role: "assistant", text, error: true }] }));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setState({ open: true, messages: [], context: null });
    inputRef.current?.focus();
  };

  if (!open) {
    return (
      <button
        type="button"
        ref={launcherRef}
        className="assistant-launcher"
        onClick={() => setOpen(true)}
      >
        <BsStars aria-hidden="true" />
        Ask Bazaar AI
      </button>
    );
  }

  const hasResults = messages.some((m) => m.products?.length);
  const remaining = MAX_MESSAGE_LENGTH - draft.length;
  return (
    <section
      className="assistant-panel"
      role="dialog"
      aria-label="Bazaar AI shopping assistant"
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      <header className="assistant-header">
        <BsStars aria-hidden="true" className="assistant-header-icon" />
        <h2>Bazaar AI</h2>
        {messages.length > 0 && (
          <button type="button" className="assistant-icon-btn" onClick={reset} title="New chat" aria-label="New chat">
            <BsArrowCounterclockwise aria-hidden="true" />
          </button>
        )}
        <button type="button" className="assistant-icon-btn" onClick={() => setOpen(false)} aria-label="Close assistant">
          <BsXLg aria-hidden="true" />
        </button>
      </header>
      <p className="assistant-notice">
        Answers are AI-generated and may be wrong: check the product page before buying. Please
        don't share personal details.
      </p>

      <div className="assistant-messages" aria-live="polite">
        {messages.length === 0 && (
          <div className="assistant-welcome">
            <p>Tell me what you're looking for, your budget, or who it's for. English, Hindi or Hinglish all work.</p>
            <div className="assistant-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message, i) => (
          // Opening a product closes the panel (the chat is kept), so it
          // doesn't cover the product page on small screens.
          <Message key={i} message={message} onPick={() => setOpen(false)} />
        ))}
        {busy && (
          <div className="assistant-msg from-bot assistant-typing" role="status">
            Finding products…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {hasResults && !busy && (
        <div className="assistant-suggestions assistant-followups">
          {["Show cheaper ones", "Best rated", "Show more"].map((s) => (
            <button key={s} type="button" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="assistant-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <label htmlFor="assistant-input" className="visually-hidden">
          Ask Bazaar AI
        </label>
        <input
          id="assistant-input"
          ref={inputRef}
          className="form-control"
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="e.g. best rated phone under 20000"
          onChange={(e) => setDraft(e.target.value)}
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()} aria-label="Send">
          <BsSend aria-hidden="true" />
        </button>
        {remaining <= 50 && (
          <span className="assistant-count" aria-live="polite">
            {remaining} characters left
          </span>
        )}
      </form>
    </section>
  );
};

export default ShoppingAssistant;
