import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// ResizeObserver / IntersectionObserver shims for Radix / Recharts
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || RO;
(globalThis as any).IntersectionObserver = (globalThis as any).IntersectionObserver || RO;

// jsdom doesn't implement scrollIntoView; many components call it after mount.
if (!(Element.prototype as any).scrollIntoView) {
  (Element.prototype as any).scrollIntoView = function () {};
}