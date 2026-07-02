export const TAG_PALETTE = [
  "blue",
  "cyan",
  "sky",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "slate",
  "zinc",
  "gray",
] as const;

export type TagHue = (typeof TAG_PALETTE)[number];

export const DEFAULT_HUE: TagHue = "zinc";

export const isTagHue = (value: string | null | undefined): value is TagHue =>
  !!value && (TAG_PALETTE as readonly string[]).includes(value);

// Full chip classes (background + text + border, light & dark variants).
// Strings must be literal so Tailwind's JIT picks them up.
const HUE_CHIP_CLASS: Record<TagHue, string> = {
  blue: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:bg-blue-500/25 dark:text-blue-300 dark:border-blue-500/40",
  cyan: "bg-cyan-500/15 text-cyan-700 border-cyan-500/30 dark:bg-cyan-500/25 dark:text-cyan-300 dark:border-cyan-500/40",
  sky: "bg-sky-500/15 text-sky-700 border-sky-500/30 dark:bg-sky-500/25 dark:text-sky-300 dark:border-sky-500/40",
  indigo:
    "bg-indigo-500/15 text-indigo-700 border-indigo-500/30 dark:bg-indigo-500/25 dark:text-indigo-300 dark:border-indigo-500/40",
  violet:
    "bg-violet-500/15 text-violet-700 border-violet-500/30 dark:bg-violet-500/25 dark:text-violet-300 dark:border-violet-500/40",
  purple:
    "bg-purple-500/15 text-purple-700 border-purple-500/30 dark:bg-purple-500/25 dark:text-purple-300 dark:border-purple-500/40",
  fuchsia:
    "bg-fuchsia-500/15 text-fuchsia-700 border-fuchsia-500/30 dark:bg-fuchsia-500/25 dark:text-fuchsia-300 dark:border-fuchsia-500/40",
  pink: "bg-pink-500/15 text-pink-700 border-pink-500/30 dark:bg-pink-500/25 dark:text-pink-300 dark:border-pink-500/40",
  rose: "bg-rose-500/15 text-rose-700 border-rose-500/30 dark:bg-rose-500/25 dark:text-rose-300 dark:border-rose-500/40",
  red: "bg-red-500/15 text-red-700 border-red-500/30 dark:bg-red-500/25 dark:text-red-300 dark:border-red-500/40",
  orange:
    "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:bg-orange-500/25 dark:text-orange-300 dark:border-orange-500/40",
  amber:
    "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:bg-amber-500/25 dark:text-amber-300 dark:border-amber-500/40",
  yellow:
    "bg-yellow-500/15 text-yellow-700 border-yellow-500/30 dark:bg-yellow-500/25 dark:text-yellow-300 dark:border-yellow-500/40",
  lime: "bg-lime-500/15 text-lime-700 border-lime-500/30 dark:bg-lime-500/25 dark:text-lime-300 dark:border-lime-500/40",
  green:
    "bg-green-500/15 text-green-700 border-green-500/30 dark:bg-green-500/25 dark:text-green-300 dark:border-green-500/40",
  emerald:
    "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:bg-emerald-500/25 dark:text-emerald-300 dark:border-emerald-500/40",
  teal: "bg-teal-500/15 text-teal-700 border-teal-500/30 dark:bg-teal-500/25 dark:text-teal-300 dark:border-teal-500/40",
  slate:
    "bg-slate-500/15 text-slate-700 border-slate-500/30 dark:bg-slate-500/25 dark:text-slate-300 dark:border-slate-500/40",
  zinc: "bg-zinc-500/15 text-zinc-700 border-zinc-500/30 dark:bg-zinc-500/25 dark:text-zinc-300 dark:border-zinc-500/40",
  gray: "bg-gray-500/15 text-gray-700 border-gray-500/30 dark:bg-gray-500/25 dark:text-gray-300 dark:border-gray-500/40",
};

// Solid swatch classes for the picker dropdown
const HUE_SWATCH_CLASS: Record<TagHue, string> = {
  blue: "bg-blue-500",
  cyan: "bg-cyan-500",
  sky: "bg-sky-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  purple: "bg-purple-500",
  fuchsia: "bg-fuchsia-500",
  pink: "bg-pink-500",
  rose: "bg-rose-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  yellow: "bg-yellow-500",
  lime: "bg-lime-500",
  green: "bg-green-500",
  emerald: "bg-emerald-500",
  teal: "bg-teal-500",
  slate: "bg-slate-500",
  zinc: "bg-zinc-500",
  gray: "bg-gray-500",
};

export const getChipClass = (hue: string | null | undefined): string =>
  HUE_CHIP_CLASS[isTagHue(hue) ? hue : DEFAULT_HUE];

export const getSwatchClass = (hue: string | null | undefined): string =>
  HUE_SWATCH_CLASS[isTagHue(hue) ? hue : DEFAULT_HUE];

export const formatHueLabel = (hue: string | null | undefined): string => {
  const h = isTagHue(hue) ? hue : DEFAULT_HUE;
  return h.charAt(0).toUpperCase() + h.slice(1);
};
