import * as matchers from "@testing-library/jest-dom/vitest";

import { expect } from "vitest";

expect.extend(matchers);

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Cleanup after each test
afterEach(() => {
  cleanup();
});
