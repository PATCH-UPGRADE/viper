/**
 * Refuse to call anything but the configured MedISAO origin.
 *
 */
export const requireSameOrigin = (candidate: string, origin: string): void => {
  let candidateOrigin: string | null = null;
  try {
    candidateOrigin = new URL(candidate).origin;
  } catch {
    candidateOrigin = null;
  }
  if (candidateOrigin !== origin) {
    throw new Error(
      `MedISAO paging tried to leave ${origin}. Refusing to follow ${candidate}.`,
    );
  }
};

/**
 * Bound a client-supplied cursor to the collection it claims to page.
 *
 */
export const requireSameCollection = (
  cursor: string,
  collectionUrl: string,
): void => {
  const collection = new URL(collectionUrl);
  requireSameOrigin(cursor, collection.origin);

  if (new URL(cursor).pathname !== collection.pathname) {
    throw new Error(
      `MedISAO cursor does not page ${collection.pathname}. Refusing to follow ${cursor}.`,
    );
  }
};
