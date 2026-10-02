import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeScope';
import { Icon, type IconName } from './Icon';

/**
 * The ink dock at the bottom of every kid screen (docs/kid-screens.md "The Point: layout B2").
 * It holds places, not information. Browsing screens get the full dock, task screens the slim
 * one (Home and Wave Check only); celebrations and Lights out render none.
 *
 * Exactly one item is active: filled with the kid's color at normal volume, ringed in focus.
 * Markers are tags, never badges: a blue "Check in" (tilted right) and a yellow to-do (tilted
 * left); never red, never a count of anything missed, no sound. A tag pops on once (stepped,
 * 0.36 s) when `pop` is set; in focus volume or with Reduce Motion it just appears, still.
 */
export type DockTag = { kind: 'checkin' | 'todo'; text: string; pop?: boolean };
export type DockItem = { key: string; label: string; icon: IconName | ReactNode; to?: string; onSelect?: () => void; tag?: DockTag };

export function InkDock({ items, active, variant = 'full', kidColor }: { items: DockItem[]; active: string; variant?: 'full' | 'slim'; kidColor?: string }) {
  const { volume } = useTheme();
  const shown = variant === 'slim' ? items.filter((i) => i.key === 'home' || i.key === 'wave_check') : items;
  if (import.meta.env.DEV) {
    if (!shown.some((i) => i.key === 'wave_check')) console.warn('InkDock: Wave Check must always be on the dock');
    if (!shown.some((i) => i.key === active)) console.warn(`InkDock: the active item "${active}" isn't on the dock`);
  }
  // At most one tag animates at a time: the first one asking to pop.
  const popping = volume === 'normal' ? shown.find((i) => i.tag?.pop && !(i.key === active && i.tag.kind === 'checkin'))?.key : undefined;
  const style = (kidColor ? { '--kid': kidColor } : {}) as CSSProperties;
  return (
    <nav className={`dk-dock dk-dock--${variant}`} aria-label="The Deck" style={style}>
      {shown.map((item) => {
        const isActive = item.key === active;
        // On Wave Check itself the invitation has done its job.
        const tag = isActive && item.tag?.kind === 'checkin' ? undefined : item.tag;
        const label = tag?.kind === 'checkin' ? `${item.label} — check-in waiting` : tag ? `${item.label} — ${tag.text}` : item.label;
        const body = (
          <>
            {tag && (
              <span className={`dk-dock__tag dk-dock__tag--${tag.kind}${popping === item.key ? ' dk-pop' : ''}`} aria-hidden="true">
                {tag.kind === 'checkin' && <Icon name="waves" size={14} strokeWidth={3} />}
                {tag.text}
              </span>
            )}
            <span className="dk-dock__icon" aria-hidden="true">
              {typeof item.icon === 'string' ? <Icon name={item.icon as IconName} size={34} /> : item.icon}
            </span>
            <span className="dk-dock__label">{item.label}</span>
          </>
        );
        const common = { className: 'dk-dock__item', 'aria-label': label, 'aria-current': isActive ? ('page' as const) : undefined, 'data-dock': item.key };
        return item.to ? (
          <Link key={item.key} to={item.to} {...common}>
            {body}
          </Link>
        ) : (
          <button key={item.key} type="button" onClick={item.onSelect} {...common}>
            {body}
          </button>
        );
      })}
    </nav>
  );
}
