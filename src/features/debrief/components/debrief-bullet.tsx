"use client";

import Link from "next/link";
import {
  type DebriefBullet as Bullet,
  DEBRIEF_PLACEHOLDER,
  debriefLinkHref,
} from "../types";

/**
 * Render one bullet, replacing each `{{n}}` marker with its link.
 *
 * A marker with no matching link renders as nothing: showing braces to a
 * clinician is worse than showing a gap.
 */
export const DebriefBulletText = ({ bullet }: { bullet: Bullet }) => (
  <>
    {/* The marker pattern has one capture group, so split alternates literal
        text with the captured link index. */}
    {bullet.text.split(DEBRIEF_PLACEHOLDER).map((part, index) => {
      if (index % 2 === 0) return part;

      const link = bullet.links[Number(part)];
      if (!link) return null;

      return (
        <Link
          // Position in the split is the only identity a part has.
          key={index}
          href={debriefLinkHref(link)}
          prefetch
          className="font-medium text-foreground underline decoration-dotted decoration-muted-foreground/60 underline-offset-4 transition-colors hover:decoration-foreground"
        >
          {link.label}
        </Link>
      );
    })}
  </>
);
