import { MascotArt } from './MascotArt';
import { useTimeline } from './useTimeline';

/**
 * Lights out (R3LightsOut): both calm (0), the turtle yawns (1.0 s), tucks into its shell while
 * the rooster roosts (2.0 s), stars come on and the screen dims to 35% (3.0 s), then very dim
 * with the one control (4.5 s), and it holds. In winter, snow drifts one step every 0.5 s
 * instead of stars. Reduce Motion: the last frame. Plays once per Lights out (`play`); a reload
 * shows the still.
 */
export function LightsOutScene({ winter, reduced, play }: { winter: boolean; reduced: boolean; play: boolean }) {
  const { beat } = useTimeline([0, 1, 2, 3, 4.5], 4.5, { reduced: reduced || !play });
  const tucked = beat >= 2;
  const snowStep = useTimeline(Array.from({ length: 20 }, (_, i) => i * 0.5), 10, { reduced: reduced || !play || !winter }).beat;
  return (
    <div className="sc-lightsout" data-testid="lights-out-scene" data-beat={beat} data-dim={beat >= 4 ? 'very' : beat >= 3 ? 'dim' : 'none'} aria-hidden="true">
      {beat >= 3 &&
        (winter ? (
          <span className="sc-snow" style={{ ['--snow' as string]: snowStep }}>
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} className="sc-snow__flake" style={{ left: `${(i * 23) % 100}%`, top: `${((i * 41 + snowStep * 6) % 90) + 2}%` }} />
            ))}
          </span>
        ) : (
          <span className="sc-stars">
            {Array.from({ length: 14 }, (_, i) => (
              <span key={i} className="sc-star" style={{ left: `${(i * 29 + 7) % 96}%`, top: `${(i * 17 + 5) % 45}%` }} />
            ))}
          </span>
        ))}
      <span className="sc-lightsout__pair">
        <MascotArt who="turtle" pose={tucked ? 'lights-tucked' : beat === 1 ? 'yawn' : 'lights-calm'} px={tucked ? 270 : 250} />
        <MascotArt who="rooster" pose={tucked ? 'roost' : 'lights-calm'} px={tucked ? 180 : 200} />
      </span>
    </div>
  );
}
