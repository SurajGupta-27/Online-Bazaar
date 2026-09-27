// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// react-router v7 needs TextEncoder, which jsdom (Jest 27) doesn't provide.
import { TextEncoder, TextDecoder } from "util";
Object.assign(global, { TextEncoder, TextDecoder });

// jsdom has no matchMedia; antd and react-hot-toast call it.
window.matchMedia =
  window.matchMedia ||
  ((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));

// jsdom (Jest 27) has no MessageChannel; antd's Select uses one only to
// schedule a macrotask, which setTimeout does equally well in tests.
if (typeof global.MessageChannel === "undefined") {
  global.MessageChannel = class {
    constructor() {
      this.port1 = { onmessage: null };
      this.port2 = {
        postMessage: (data) =>
          setTimeout(() => this.port1.onmessage && this.port1.onmessage({ data })),
      };
    }
  };
}

// jsdom has no ResizeObserver; antd's open Select dropdown observes its size.
if (typeof global.ResizeObserver === "undefined") {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
