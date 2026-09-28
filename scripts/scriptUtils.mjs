// Shared setup for the one-off database scripts in this folder.
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

export const args = process.argv.slice(2);
export const APPLY = args.includes("--apply");

// "--limit 5" -> 5; undefined when the flag is missing.
export const numberArg = (name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = Number(args[index + 1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} needs a positive number`);
  }
  return value;
};

// Host and database name, never the username or password.
export const describeDatabase = (uri) => {
  try {
    const url = new URL(uri);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return "(unparseable MONGO_URL)";
  }
};

export const connect = async () => {
  if (!process.env.MONGO_URL) throw new Error("MONGO_URL is missing from .env");
  await mongoose.connect(process.env.MONGO_URL);
  console.log(`Database: ${describeDatabase(process.env.MONGO_URL)}`);
  console.log(APPLY ? "Mode: APPLY (changes will be written)\n" : "Mode: dry run (nothing is written; add --apply to make changes)\n");
};

// Runs fn over items, `limit` at a time.
export const eachLimit = async (items, limit, fn) => {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
};

export const run = (main) =>
  main()
    .catch((error) => {
      console.error(`\nFailed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
