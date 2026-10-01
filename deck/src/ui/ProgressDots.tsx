import type { CSSProperties } from 'react';
import { useTheme } from '../theme/ThemeScope';
import { tiltFor } from '../theme/volume';
import { Icon } from './Icon';

const STICKER_COLORS = ['var(--yellow)', 'var(--cyan)', 'var(--lime)', 'var(--orange)', 'var(--lilac)', 'var(--magenta)'];

/**
 * Routine progress. Normal volume: each done step is its own sticker color with a tilt.
 * Focus volume: done steps use only the kid's accent, small and quiet.
 */
export function ProgressDots({ total, done, size = 64, label }: { total: number; done: number; size?: number; label?: string }) {
  const { volume } = useTheme();
  return (
    <div
      className="dk-dots"
      role="img"
      aria-label={label ?? `${done} of ${total} done`}
      style={{ '--dot-size': `${size}px`, '--dot-gap': `${Math.round(size / 5)}px`, '--dot-count': total } as CSSProperties}
    >
      {Array.from({ length: total }, (_, i) => {
        const state = i < done ? 'done' : i === done ? 'current' : 'empty';
        const css =
          state === 'done'
            ? ({ '--tilt': tiltFor(`dot${i}`, 6), ...(volume === 'normal' ? { '--dot-color': STICKER_COLORS[i % STICKER_COLORS.length] } : {}) } as CSSProperties)
            : undefined;
        return (
          <span key={i} className={`dk-dot dk-dot--${state}`} style={css}>
            {state === 'done' && size >= 40 && <Icon name="check" size={Math.round(size * 0.5)} strokeWidth={3} />}
          </span>
        );
      })}
    </div>
  );
}
