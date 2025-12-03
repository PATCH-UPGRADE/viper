export const BASE_URL = "http://localhost:3000/api/v1";

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable is required for tests");
}
export const AUTH_TOKEN = `Bearer ${process.env.API_KEY}`;

export const generateCPE = (suffix: string) =>
  `cpe:2.3:o:vendor:product:${suffix}`;

describe("Configuration Tests", () => {
  it("dummy test", async () => {
    expect(true).toBeTruthy();
  });
});
