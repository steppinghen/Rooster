import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

/** Large rounded tile with a live status line. Lifts and gets a bright ring when touched. */
export function Tile({
  icon,
  label,
  status,
  tilt,
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode; label: string; status?: string; tilt?: string }) {
  return (
    <button type="button" className="dk-tile" style={tilt ? ({ ...style, '--tilt': tilt } as CSSProperties) : style} {...rest}>
      {icon}
      <span>{label}</span>
      {status && <span className="dk-tile__status">{status}</span>}
    </button>
  );
}
