import type { ElementType, ReactNode } from 'react';

/** Display headline. Two-color misregistered shadow in normal volume, plain in focus. */
export function Headline({ as: Tag = 'h1', size = 56, small, children }: { as?: ElementType; size?: number; small?: boolean; children: ReactNode }) {
  return (
    <Tag className={small ? 'dk-headline dk-headline--sm' : 'dk-headline'} style={{ fontSize: size }}>
      {children}
    </Tag>
  );
}

/** Marker lettering: decoration only. Anything a kid must read uses plain Archivo. */
export function Marker({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <span className="dk-marker" style={{ fontSize: size }}>
      {children}
    </span>
  );
}
