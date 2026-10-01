import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'ink' | 'accent' | 'yellow' | 'card';

export function PressButton({
  variant = 'card',
  block,
  round,
  small,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean; round?: boolean; small?: boolean; children: ReactNode }) {
  const cls = [
    'dk-btn',
    variant !== 'card' && `dk-btn--${variant}`,
    block && 'dk-btn--block',
    round && 'dk-btn--round',
    small && 'dk-btn--sm',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}
