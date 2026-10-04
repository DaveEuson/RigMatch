// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { UI_ICON_ART, type UiIconName } from './uiIconArt';

/**
 * One of the redesign's interface icons, drawn in the current text color.
 *
 * The art is trusted, generated markup (uiIconArt.ts), not anything a user or
 * a model wrote, which is what makes setting it as HTML safe here. Decorative
 * by default; pass `label` when the icon is the only thing saying what a
 * control does.
 */
export function UiIcon({ name, size = 18, className, label }: {
  name: UiIconName;
  size?: number;
  className?: string;
  label?: string;
}) {
  const art = UI_ICON_ART[name];
  return (
    <svg
      className={className ? `ui-icon ${className}` : 'ui-icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={art.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: art.body }}
    />
  );
}

export type { UiIconName };
