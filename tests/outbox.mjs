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

// A font's ToUnicode CMap as a Map from 2-byte glyph code to text.
const toUnicodeMap = (cmap) => {
  const map = new Map();
  const utf16 = (hex) => Buffer.from(hex, "hex").swap16().toString("utf16le");
  for (const [, block] of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, from, to, rest] of block.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(\[[^\]]*\]|<[0-9a-f]+>)/gi)) {
      const start = parseInt(from, 16);
      const end = parseInt(to, 16);
      if (rest.startsWith("[")) {
        [...rest.matchAll(/<([0-9a-f]+)>/gi)].forEach(([, hex], i) => map.set(start + i, utf16(hex)));
      } else {
        const base = parseInt(rest.slice(1, -1), 16);
        for (let code = start; code <= end; code++) map.set(code, String.fromCodePoint(base + code - start));
      }
    }
  }
  for (const [, block] of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, code, hex] of block.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) map.set(parseInt(code, 16), utf16(hex));
  }
  return map;
};

// The text of a PDF made with compress: false. PDFKit writes each line as a
// TJ array of hex strings split by kerning numbers: single bytes for the
// built-in fonts, 2-byte glyph codes for embedded fonts (such as the
// invoice's Noto Sans), which are read back through the font's ToUnicode map.
export const pdfText = (pdf) => {
  const source = Buffer.from(pdf).toString("latin1");
  const objects = new Map(
    [...source.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)].map(([, id, body]) => [id, body])
  );
  const fonts = new Map();
  for (const [, dict] of source.matchAll(/\/Font\s*<<([^>]*)>>/g)) {
    for (const [, name, id] of dict.matchAll(/\/(\w+)\s+(\d+) 0 R/g)) {
      const toUnicode = objects.get(id)?.match(/\/ToUnicode (\d+) 0 R/)?.[1];
      fonts.set(name, toUnicode ? toUnicodeMap(objects.get(toUnicode)) : null);
    }
  }
  let cmap = null;
  const lines = [];
  for (const [, font, parts] of source.matchAll(/\/(\w+) [\d.]+ Tf|\[([^\]]*)\]\s*TJ/g)) {
    if (font) {
      cmap = fonts.get(font) || null;
      continue;
    }
    lines.push(
      [...parts.matchAll(/<([0-9a-f]*)>/gi)]
        .map(([, hex]) =>
          cmap
            ? hex.match(/.{4}/g)?.map((code) => cmap.get(parseInt(code, 16)) ?? "�").join("") ?? ""
            : Buffer.from(hex, "hex").toString("latin1")
        )
        .join("")
    );
  }
  return lines.join("\n");
};

// An attachment's bytes from Nodemailer's JSON transport output.
export const attachmentBytes = (attachment) =>
  Buffer.from(attachment.content, attachment.encoding === "base64" ? "base64" : "utf8");
