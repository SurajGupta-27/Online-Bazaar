// Text people write (reviews) is stored as plain text: HTML tags are removed
// (block tags like <br> and <p> become line breaks), along with the contents
// of <script> and <style> blocks, leftover angle brackets, control and
// zero-width characters. Runs of spaces and blank lines are collapsed; single
// line breaks are kept.
export const plainText = (value) =>
  String(value)
    .normalize("NFKC")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(br|p|div|li|ul|ol|h[1-6]|tr|table|blockquote)\b[^>]*>/gi, "\n")
    .replace(/<\/?[a-z!][^>]*>/gi, "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F​-‍⁠﻿]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
