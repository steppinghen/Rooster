import type { CSSProperties, ReactNode } from 'react';
import { useTheme } from '../theme/ThemeScope';
import { sizeClass, type SizeClass } from './sizeClass';

/**
 * The one die-cut every sticker gets, whatever its source (original art or Fluent Emoji): a
 * paper rim, a thin ink line and a hard offset shadow. The rim is thinner at the small class
 * (the 44 px My week size). Tilt applies at normal volume only. The class follows the rendered
 * size and the volume (sizeClass), and is exposed as data-size so art can pick its file.
 */
export function DieCut({
  size,
  tilt = 0,
  children,
  label,
  className,
}: {
  size: number;
  /** Degrees; ignored in focus volume. */
  tilt?: number;
  children: ReactNode;
  /** Accessible name; omit for decorative art. */
  label?: string;
  className?: string;
}) {
  const { volume } = useTheme();
  const cls: SizeClass = sizeClass(size, volume);
  const css = { '--cut-size': `${size}px`, '--tilt': `${tilt}deg` } as CSSProperties;
  return (
    <span
      className={`dk-cut dk-cut--${cls}${className ? ` ${className}` : ''}`}
      data-size={cls}
      style={css}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {children}
    </span>
  );
}
