/**
 * Capitalizes the first letter of a string
 *
 * @param str - String to capitalize
 * @returns String with first letter capitalized
 *
 * @example
 * capitalize('hello') // 'Hello'
 * capitalize('WORLD') // 'WORLD'
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Formats a resource/model name for display in error messages
 * Converts to string and capitalizes
 *
 * @param modelName - Model or resource name
 * @returns Formatted resource name
 *
 * @example
 * formatResourceName('asset') // 'Asset'
 * formatResourceName('vulnerability') // 'Vulnerability'
 */
export function formatResourceName(modelName: string | symbol): string {
  return capitalize(String(modelName));
}
