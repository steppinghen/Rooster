import type { CSSProperties } from 'react';
import { artSrc, isArtKey } from '../art/art';
import { accentVar, type Accent } from '../lib/types';

/**
 * A kid's avatar: their "pro model" deck colors, with their art in the middle. Uses the
 * avatar chip styling, so it follows volume (accent fill in normal, accent ring in focus).
 */
export function KidAvatar({ nickname, avatar, accent, size = 72 }: { nickname: string; avatar: string; accent: Accent; size?: number }) {
  const css = { '--accent': accentVar(accent), '--avatar-size': `${size}px` } as CSSProperties;
  return (
    <span className="dk-avatar dk-avatar--art" style={css} role="img" aria-label={nickname}>
      {isArtKey(avatar) ? <img src={artSrc(avatar)} alt="" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} /> : nickname.slice(0, 1).toUpperCase()}
    </span>
  );
}
