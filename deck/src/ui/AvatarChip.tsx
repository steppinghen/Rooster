import type { ButtonHTMLAttributes, CSSProperties } from 'react';

/** Kid or parent avatar. Accent fill in normal volume; plain chip with an accent ring in focus. */
export function AvatarChip({
  initial,
  accent,
  size = 72,
  label,
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { initial: string; accent: string; size?: number; label?: string }) {
  const css = { ...style, '--accent': accent, '--avatar-size': `${size}px` } as CSSProperties;
  const chip = (
    <button type="button" className="dk-avatar" style={css} aria-label={label ?? initial} {...rest}>
      {initial}
    </button>
  );
  if (!label) return chip;
  return (
    <span className="dk-avatar-label">
      {chip}
      <span aria-hidden="true">{label}</span>
    </span>
  );
}
