// Collects React "unique key" warnings logged while a test runs.
export const watchKeyWarnings = () => {
  const warnings = [];
  const spy = jest.spyOn(console, "error").mockImplementation((...args) => {
    if (args.some((a) => typeof a === "string" && /unique "key"|same key/.test(a))) {
      warnings.push(args.join(" "));
    }
  });
  return { warnings, restore: () => spy.mockRestore() };
};
