import nodemailer from "nodemailer";
import { appendFile } from "node:fs/promises";
import { BRAND } from "./brand.js";

// Two ways to send, picked by EMAIL_PROVIDER (default: brevo when
// BREVO_API_KEY is set, else smtp):
// - smtp: Gmail SMTP with EMAIL_USER and EMAIL_APP_PASSWORD (a Gmail App
//   Password). Free hosts such as Render's free plan block SMTP ports.
// - brevo: Brevo's HTTPS email API (free plan: 300 emails a day) with
//   BREVO_API_KEY, sending from EMAIL_FROM (or EMAIL_USER), an address
//   verified as a sender in Brevo.
// EMAIL_OUTBOX (tests only) writes each message as a line of JSON to that
// file instead, without any network access.
const provider = () =>
  (process.env.EMAIL_PROVIDER || (process.env.BREVO_API_KEY ? "brevo" : "smtp")).trim().toLowerCase();

const fromAddress = () => process.env.EMAIL_FROM || process.env.EMAIL_USER;

export const emailConfigured = () =>
  provider() === "brevo"
    ? Boolean(process.env.BREVO_API_KEY && fromAddress())
    : Boolean(process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD);

let transport;
let transportKey;
const getTransport = () => {
  const key = `${process.env.EMAIL_OUTBOX || ""}|${process.env.EMAIL_USER}`;
  if (!transport || transportKey !== key) {
    transport = process.env.EMAIL_OUTBOX
      ? nodemailer.createTransport({ jsonTransport: true })
      : nodemailer.createTransport({
          service: "gmail",
          auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APP_PASSWORD },
          connectionTimeout: 15000,
          greetingTimeout: 10000,
          socketTimeout: 30000,
        });
    transportKey = key;
  }
  return transport;
};

// Brevo adds its own List-Unsubscribe header and refuses standard headers,
// so `headers` and `list` are left out; the unsubscribe link in the email
// body still works. Attachments are Nodemailer-style { filename, content }.
const sendWithBrevo = async ({ to, subject, html, text, attachments }) => {
  const apiUrl = process.env.BREVO_API_URL || "https://api.brevo.com/v3";
  const res = await fetch(`${apiUrl}/smtp/email`, {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: BRAND.name, email: fromAddress() },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      ...(text && { textContent: text }),
      ...(attachments.length && {
        attachment: attachments.map((file) => ({
          name: file.filename,
          content: Buffer.from(file.content).toString("base64"),
        })),
      }),
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    // Brevo answers { code, message }; never log the request (it has the key).
    const detail = await res.json().catch(() => ({}));
    throw new Error(`Brevo answered ${res.status}${detail.code ? ` (${detail.code}: ${detail.message})` : ""}`);
  }
};

// Header values must stay on one line.
const oneLine = (value) => String(value ?? "").replace(/[\r\n]+/g, " ").trim();

// Sends one email and resolves when done; rejects on failure. Returns false
// (and sends nothing) when email isn't configured. Callers that must not be
// slowed down or broken by email use sendInBackground() instead.
export const sendMail = async ({ to, subject, html, text, attachments = [], headers, list }) => {
  if (!emailConfigured()) {
    console.log(`Email not configured; skipped "${oneLine(subject)}"`);
    return false;
  }
  if (provider() === "brevo" && !process.env.EMAIL_OUTBOX) {
    await sendWithBrevo({ to: oneLine(to), subject: oneLine(subject), html, text, attachments });
    return true;
  }
  const info = await getTransport().sendMail({
    from: { name: BRAND.name, address: fromAddress() },
    to: oneLine(to),
    subject: oneLine(subject),
    html,
    text,
    attachments,
    ...(headers && { headers }),
    // e.g. { unsubscribe: url }: Nodemailer writes the List-Unsubscribe header.
    ...(list && { list }),
  });
  if (process.env.EMAIL_OUTBOX) {
    await appendFile(process.env.EMAIL_OUTBOX, `${info.message.replace(/\n/g, " ")}\n`);
  }
  return true;
};

// Runs `task` after the current request has been answered. Failures are
// logged on the server and never reach the customer.
export const sendInBackground = (label, task) => {
  setImmediate(async () => {
    try {
      await task();
    } catch (error) {
      console.log(`Email failed (${label}): ${error.message}`);
    }
  });
};
