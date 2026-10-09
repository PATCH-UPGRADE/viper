// Preloaded by the seed (package.json "prisma.seed"). The seed runs under plain tsx, outside
// Next.js, where `import "server-only"` throws. The seed is server code, so treat that package as
// already loaded and empty. Server modules the seed reuses can then keep their guard.
const Module = require("node:module");

const path = require.resolve("server-only");
const stub = new Module(path);
stub.filename = path;
stub.loaded = true;
stub.exports = {};
require.cache[path] = stub;
