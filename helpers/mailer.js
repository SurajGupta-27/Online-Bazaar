import nodemailer from "nodemailer";
import { appendFile } from "node:fs/promises";
import { BRAND } from "./brand.js";

// Sends through Gmail SMTP with EMAIL_USER and EMAIL_APP_PASSWORD (a Gmail
// App Password). EMAIL_OUTBOX (tests only) writes each message as a line of
// JSON to that file instead, without any network access.
export const emailConfigured = () =>
  Boolean(process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD);

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

// Header values must stay on one line.
const oneLine = (value) => String(value ?? "").replace(/[\r\n]+/g, " ").trim();

// Sends one email and resolves when done; rejects on failure. Returns false
// (and sends nothing) when email isn't configured. Callers that must not be
// slowed down or broken by email use sendInBackground() instead.
export const sendMail = async ({ to, subject, html, text, attachments = [] }) => {
  if (!emailConfigured()) {
    console.log(`Email not configured; skipped "${oneLine(subject)}"`);
    return false;
  }
  const info = await getTransport().sendMail({
    from: { name: BRAND.name, address: process.env.EMAIL_USER },
    to: oneLine(to),
    subject: oneLine(subject),
    html,
    text,
    attachments,
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
