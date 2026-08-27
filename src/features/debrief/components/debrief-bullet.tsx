"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  type DebriefBullet as Bullet,
  DEBRIEF_PLACEHOLDER,
  debriefLinkHref,
} from "../types";

/**
 * Render one bullet, replacing each `{{n}}` marker with its link.
 *
 *
 * A marker with no matching link renders as nothing rather than as literal
 * "{{0}}" text. That should be unreachable — validateBullets guarantees the
 * correspondence before storage — but a stored row predates any given
 * deployment, and showing braces to a clinician is worse than showing a gap.
 */
export const DebriefBulletText = ({ bullet }: { bullet: Bullet }) => {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  // matchAll needs a fresh lastIndex; the shared regex carries the `g` flag.
  for (const match of bullet.text.matchAll(DEBRIEF_PLACEHOLDER)) {
    const at = match.index ?? 0;
    if (at > cursor) parts.push(bullet.text.slice(cursor, at));

    const link = bullet.links[Number(match[1])];
    if (link) {
      parts.push(
        <Link
          key={`link-${key}`}
          href={debriefLinkHref(link)}
          prefetch
          className="font-medium text-foreground underline decoration-dotted decoration-muted-foreground/60 underline-offset-4 transition-colors hover:decoration-foreground"
        >
          {link.label}
        </Link>,
      );
    }

    cursor = at + match[0].length;
    key += 1;
  }

  if (cursor < bullet.text.length) parts.push(bullet.text.slice(cursor));

  return <>{parts}</>;
};
