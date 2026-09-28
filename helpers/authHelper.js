import bcrypt from "bcrypt";
import { escapeRegex } from "./escapeRegex.js";

export const hashPassword = async (password) => {
  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
  } catch (error) {
    console.log(error);
  }
};

export const comparePassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

// Compared against when an email isn't registered, so the response takes the
// same time whether or not the account exists.
export const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

// Security answers are matched case-insensitively ("Cricket" == "cricket").
// Invisible characters (zero-width spaces, BOM) that sneak in through
// copy-paste or old data are dropped, and look-alike forms are unified (NFKC).
export const normalizeAnswer = (answer) =>
  String(answer)
    .normalize("NFKC")
    .replace(/[​-‍⁠﻿]/g, "")
    .trim()
    .toLowerCase();

export const isBcryptHash = (value) => /^\$2[aby]\$\d{2}\$/.test(value || "");

export const normalizeEmail = (email) => String(email).trim().toLowerCase();

// Accounts created before emails were lowercased on save may still hold
// "User@Example.com" or stray spaces, which an exact lookup misses.
export const findUserByEmail = async (model, email) => {
  const normalized = normalizeEmail(email);
  const user = await model.findOne({ email: normalized });
  if (user) return user;
  // A RegExp object (not a $regex string) so Mongoose's lowercase setter
  // doesn't rewrite the pattern.
  return model.findOne({
    email: new RegExp(`^\\s*${escapeRegex(normalized)}\\s*$`, "i"),
  });
};