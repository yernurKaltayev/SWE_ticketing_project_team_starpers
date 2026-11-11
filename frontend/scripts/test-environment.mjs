// Node can expose native Web Storage getters even when no backing file exists.
// Vitest then keeps those globals instead of copying jsdom's browser storage.
// Use the actual jsdom window before test modules/MSW are imported. Its global
// window alias points back to globalThis, so window.localStorage is insufficient.
// Node-only suites intentionally have no browser storage or disk persistence.
const browser = globalThis.jsdom?.window;
for (const name of ["localStorage", "sessionStorage"]) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: true,
    writable: true,
    value: browser ? browser[name] : undefined,
  });
}
