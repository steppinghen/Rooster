import type { CSSProperties, ReactNode } from 'react';
import { artSrc, isArtKey } from '../art/art';
import { accentVar, type Accent } from '../lib/types';

/**
 * The kid header on every kid screen (B2 frames): the permanent sky band (the screen's top
 * padding, see .dk-kidscreen), the holiday trim hanging in it, the seasonal sun or holiday
 * circle behind the avatar, the marker greeting, the offset headline and the kid's avatar.
 *
 * Accents overlay and never push content down. Trim and corner sit below all content, can't be
 * tapped, and drop out in focus volume (CSS). What goes in them (which sun, which holiday) is the
 * caller's call: browsing screens pass them, task screens don't.
 */
export function KidHeader({
  greeting,
  title,
  kid,
  onAvatar,
  trim,
  corner,
}: {
  greeting: string;
  title: string;
  kid: { nickname: string; avatar: string; accent: Accent };
  /** Opens My look (The Point only). Without it the avatar is a plain picture. */
  onAvatar?: () => void;
  /** The holiday edge trim (art, at most 72 px tall). */
  trim?: ReactNode;
  /** The seasonal sun or holiday circle (400 px art). */
  corner?: ReactNode;
}) {
  const avatar = isArtKey(kid.avatar) ? <img src={artSrc(kid.avatar)} alt="" width={52} height={52} draggable={false} /> : kid.nickname.slice(0, 1).toUpperCase();
  const style = { '--kid': accentVar(kid.accent) } as CSSProperties;
  return (
    <>
      {trim && (
        <div className="dk-trim" aria-hidden="true">
          {trim}
        </div>
      )}
      {corner && (
        <div className="dk-corner" aria-hidden="true">
          {corner}
        </div>
      )}
      <header className="dk-kidhead" style={style}>
        <div className="dk-kidhead__words">
          <span className="dk-marker dk-kidhead__greet">{greeting}</span>
          <h1 className="dk-headline dk-kidhead__title">{title}</h1>
        </div>
        {onAvatar ? (
          <button type="button" className="dk-head-avatar" aria-label="My look" onClick={onAvatar}>
            {avatar}
          </button>
        ) : (
          <span className="dk-head-avatar" role="img" aria-label={kid.nickname}>
            {avatar}
          </span>
        )}
      </header>
    </>
  );
}
