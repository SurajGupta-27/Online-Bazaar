import { formatPrice } from "./formatPrice";

test("formats rupees with Indian digit grouping", () => {
  expect(formatPrice(129990)).toBe("₹1,29,990");
  expect(formatPrice(99)).toBe("₹99");
  expect(formatPrice(0)).toBe("₹0");
});

test("shows paise only when present", () => {
  expect(formatPrice(2.5)).toBe("₹2.50");
  expect(formatPrice(12.345)).toBe("₹12.35");
});

test("treats bad input as zero", () => {
  expect(formatPrice(undefined)).toBe("₹0");
  expect(formatPrice("abc")).toBe("₹0");
});
