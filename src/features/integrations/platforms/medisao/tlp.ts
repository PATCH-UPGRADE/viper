import { Tlp } from "@/generated/prisma";

const TLP_VALUES = new Set<string>(Object.values(Tlp));

/**
 * Read MedISAO's stated TLP into ours.
 *
 * Their values line up with `enum Tlp`, but the marking is written several ways
 * in the wild: with the "TLP:" prefix, and with a space or a plus where the
 * enum has an underscore. An unrecognised marking returns undefined rather than
 * a guess, which leaves the classifier's own reading in place.
 */
export const parseTlp = (value: string | null | undefined): Tlp | undefined => {
  if (!value) return undefined;

  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/^TLP\s*[:-]?\s*/, "")
    .replace(/[\s+-]+/g, "_");

  return TLP_VALUES.has(normalized) ? (normalized as Tlp) : undefined;
};
