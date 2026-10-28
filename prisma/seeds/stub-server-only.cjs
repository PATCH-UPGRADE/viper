// Preloaded by the seed (package.json "prisma.seed") and by the scripts/seed-*.ts that create
// vulnerabilities (`npx tsx --require ./prisma/seeds/stub-server-only.cjs scripts/<name>.ts`).
// They run under plain tsx, outside Next.js, where `import "server-only"` throws. They are server
// code, so treat that package as already loaded and empty. Server modules they reuse can then
// keep their guard.
const Module = require("node:module");

const path = require.resolve("server-only");
const stub = new Module(path);
stub.filename = path;
stub.loaded = true;
stub.exports = {};
require.cache[path] = stub;
