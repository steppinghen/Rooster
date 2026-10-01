import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

type SurfaceProps = HTMLAttributes<HTMLDivElement> & { children: ReactNode; tilt?: string; 'data-testid'?: string };

function withTilt(style: CSSProperties | undefined, tilt: string | undefined): CSSProperties | undefined {
  return tilt ? ({ ...style, '--tilt': tilt } as CSSProperties) : style;
}

/** Comic-panel card: night panel / day paper, ink outline, hard offset shadow. */
export function Panel({ children, tilt, className = '', style, ...rest }: SurfaceProps) {
  return (
    <div className={`dk-panel ${className}`} style={withTilt(style, tilt)} {...rest}>
      {children}
    </div>
  );
}

/** The cream task card. Same in both volumes; it is what holds the task in focus mode. */
export function TaskCard({ children, tilt, className = '', style, ...rest }: SurfaceProps) {
  return (
    <div className={`dk-card ${className}`} style={withTilt(style, tilt)} {...rest}>
      {children}
    </div>
  );
}

/** A big block in the kid's accent ("Up next"). Becomes the card in focus volume. */
export function AccentBlock({ children, className = '', style, ...rest }: Omit<SurfaceProps, 'tilt'>) {
  return (
    <div className={`dk-accent-block ${className}`} style={style} {...rest}>
      {children}
    </div>
  );
}
