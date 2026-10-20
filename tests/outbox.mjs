// Captures the server's emails in a file instead of sending them (the mailer's
// EMAIL_OUTBOX mode uses Nodemailer's JSON transport: no network at all).
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createOutbox() {
  const file = join(mkdtempSync(join(tmpdir(), "ob-mail-")), "outbox.jsonl");
  writeFileSync(file, "");
  const read = () =>
    existsSync(file)
      ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
      : [];
  return {
    file,
    read,
    // Emails go out after the response, so wait until `count` have arrived.
    async waitFor(count, timeoutMs = 5000) {
      const until = Date.now() + timeoutMs;
      while (read().length < count && Date.now() < until) {
        await new Promise((r) => setTimeout(r, 50));
      }
      return read();
    },
    clear: () => writeFileSync(file, ""),
  };
}

export const emailEnv = (outbox) => ({
  EMAIL_USER: "shop@test.example",
  EMAIL_APP_PASSWORD: "test-app-password",
  EMAIL_OUTBOX: outbox.file,
});

// The text of a PDF made with compress: false: PDFKit writes each line as a
// TJ array of hex strings split by kerning numbers.
export const pdfText = (pdf) =>
  [...Buffer.from(pdf).toString("latin1").matchAll(/\[([^\]]*)\]\s*TJ/g)]
    .map(([, parts]) =>
      [...parts.matchAll(/<([0-9a-f]*)>/gi)].map(([, hex]) => Buffer.from(hex, "hex").toString("latin1")).join("")
    )
    .join("\n");

// An attachment's bytes from Nodemailer's JSON transport output.
export const attachmentBytes = (attachment) =>
  Buffer.from(attachment.content, attachment.encoding === "base64" ? "base64" : "utf8");
