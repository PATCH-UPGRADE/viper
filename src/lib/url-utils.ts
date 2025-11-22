/**
 * Gets the base URL for the application
 * - Client-side: Returns empty string (relative URLs)
 * - Vercel: Uses VERCEL_URL
 * - Local: Uses NEXT_PUBLIC_APP_URL or defaults to localhost:3000
 *
 * @returns Base URL string
 *
 * @example
 * getBaseUrl() // '' (client) or 'https://app.vercel.app' (server)
 */
export function getBaseUrl(): string {
  // Client-side: use relative URLs
  if (typeof window !== "undefined") return "";

  // Vercel deployment
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  // Local development or custom deployment
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

/**
 * Constructs a full API URL from an endpoint path
 *
 * @param endpoint - API endpoint path (should start with /)
 * @returns Full URL to the API endpoint
 *
 * @example
 * getApiUrl('/api/trpc') // 'http://localhost:3000/api/trpc' (server)
 * getApiUrl('/api/trpc') // '/api/trpc' (client)
 */
export function getApiUrl(endpoint: string): string {
  return `${getBaseUrl()}${endpoint}`;
}
