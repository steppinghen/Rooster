import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type NavItem = { key: string; label: string; icon: IconName; spacerBefore?: boolean };

/**
 * Parent navigation. "rail" for iPad landscape (iPadHub.html), "tabs" for the phone (Main.html).
 * Items come from data (the module registry), never a hardcoded list in screens.
 */
export function NavBar({ items, current, variant, onSelect, brand }: { items: NavItem[]; current: string; variant: 'rail' | 'tabs'; onSelect?: (key: string) => void; brand?: string }) {
  return (
    <nav className={`dk-nav dk-nav--${variant}`} aria-label="Main">
      {brand && variant === 'rail' && (
        <span className="dk-nav__brand" aria-hidden="true">
          {brand}
        </span>
      )}
      {items.map((item) => (
        <FragmentWithSpacer key={item.key} spacer={item.spacerBefore}>
          <button
            type="button"
            className="dk-nav__item"
            aria-current={item.key === current ? 'page' : undefined}
            onClick={() => onSelect?.(item.key)}
          >
            <Icon name={item.icon} size={24} />
            <span>{item.label}</span>
          </button>
        </FragmentWithSpacer>
      ))}
    </nav>
  );
}

function FragmentWithSpacer({ spacer, children }: { spacer?: boolean; children: ReactNode }) {
  return (
    <>
      {spacer && <span className="dk-nav__spacer" />}
      {children}
    </>
  );
}
