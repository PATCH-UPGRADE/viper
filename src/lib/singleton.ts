/**
 * Creates a singleton instance on the server side
 * Handles both development (with hot reload) and production environments
 *
 * @param name - Unique name for this singleton instance
 * @param factory - Factory function that creates the instance
 * @returns Function that returns the singleton instance
 *
 * @example
 * const getPrisma = createServerSingleton('prisma', () => new PrismaClient());
 * const prisma = getPrisma();
 */
export function createServerSingleton<T>(
  name: string,
  factory: () => T,
): () => T {
  const globalKey = `__singleton_${name}__` as const;

  return () => {
    const globalObj = global as unknown as Record<string, T>;

    if (!globalObj[globalKey]) {
      globalObj[globalKey] = factory();
    }

    return globalObj[globalKey];
  };
}

/**
 * Creates a singleton instance for browser/client side
 * Returns fresh instances on server, singleton on client
 *
 * @param factory - Factory function that creates the instance
 * @returns Function that returns the singleton instance (client) or fresh instance (server)
 *
 * @example
 * const getQueryClient = createBrowserSingleton(() => new QueryClient());
 * const client = getQueryClient();
 */
export function createBrowserSingleton<T>(factory: () => T): () => T {
  let instance: T | undefined;

  return () => {
    // Always create fresh instances on server-side
    if (typeof window === "undefined") {
      return factory();
    }

    // Singleton on client-side
    if (!instance) {
      instance = factory();
    }

    return instance;
  };
}
