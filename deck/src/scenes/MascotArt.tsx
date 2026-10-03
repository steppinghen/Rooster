import type { CSSProperties } from 'react';
import { mascotFolder, seasonalPose, type Mascot, type Pose } from '../art/mascots';
import { artFor, artUrl } from '../art/original';
import { useTheme } from '../theme/ThemeScope';
import { useFamilySettings } from './SceneContext';

/**
 * A mascot pose from the exported art. Asks for "dog" and gets the season's (or the pinned)
 * dog; standing and board poses become their winter versions in winter; the size class follows
 * the rendered size and the volume. Decorative unless given a label.
 */
export function MascotArt({ who, pose, px, label, mirror, className, style }: { who: Mascot; pose: Pose; px: number; label?: string; mirror?: boolean; className?: string; style?: CSSProperties }) {
  const { volume } = useTheme();
  const settings = useFamilySettings();
  const today = new Date();
  const folder = mascotFolder(who, today, settings);
  const seasonal = seasonalPose(pose, today, settings);
  const src = artFor(folder, seasonal, px, volume) ?? artFor(folder, pose, px, volume) ?? artUrl(folder, 'calm', 'md');
  return (
    <img
      src={src}
      width={px}
      height={px}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      draggable={false}
      className={`sc-mascot${className ? ` ${className}` : ''}`}
      style={{ ...style, ...(mirror ? { scale: '-1 1' } : {}) }}
      data-pose={seasonal}
      data-who={folder.split('/')[1]}
    />
  );
}

/** A prop from the exported art (sparkle, spin lines, wave strip, impact lines). */
export function PropArt({ name, width, className, style }: { name: 'sparkle' | 'spin-lines' | 'wave-strip' | 'impact-lines'; width: number; className?: string; style?: CSSProperties }) {
  return <img src={artUrl('props', name, 'lg')} width={width} alt="" aria-hidden="true" draggable={false} className={className} style={style} />;
}
