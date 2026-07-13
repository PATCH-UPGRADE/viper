// No-op stand-in for the `server-only` package under Vitest, so server modules
// (which `import "server-only"` to guard against client bundling) can be
// imported in unit tests. In the real Next.js build the true package still
// enforces the server/client boundary.
export {};
