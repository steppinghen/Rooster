import { isArtKey } from '../art/art';
import type { Kid } from '../lib/types';
import { Icon } from '../ui/Icon';
import { PressButton } from '../ui/PressButton';
import { Sticker } from '../ui/Sticker';
import { Panel, TaskCard } from '../ui/surfaces';
import { familyDate } from './cache';
import { sleepsLabel, upcomingCountdowns } from './dates';
import { KidFrame } from './KidFrame';
import { KidTheme } from './KidTheme';
import { speak } from './speech';
import { useKidStore } from './store';
import { useNow } from './useNow';
import './dates.css';

const MAX_MOONS = 14;

function spoken(sleeps: number, title: string) {
  if (sleeps <= 0) return `${title} is today!`;
  return `${sleeps} ${sleeps === 1 ? 'sleep' : 'sleeps'} until ${title}.`;
}

/** "How many sleeps until…" One big countdown, then the next few. Pre-readers count moons. */
export function TourDates({ kid }: { kid: Kid }) {
  const { snapshot } = useKidStore();
  const now = useNow(60_000);
  const today = familyDate(snapshot!.family.timezone, new Date(now));
  const list = upcomingCountdowns(snapshot!.events, snapshot!.kids, today).slice(0, 5);
  const [first, ...rest] = list;
  const prereader = kid.age_band === 'prereader';

  return (
    <KidTheme kid={kid}>
      <KidFrame kid={kid} title="Tour Dates">
        {first ? (
          <TaskCard className="dt-hero" data-testid="countdown-hero">
            <Sticker art={isArtKey(first.icon) ? first.icon : 'star'} size={prereader ? 180 : 150} decorative />
            <p className="dk-title dt-hero__count">{first.sleeps <= 0 ? 'Today!' : sleepsLabel(first.sleeps)}</p>
            <p className="dt-hero__until">{first.sleeps <= 0 ? first.title : `until ${first.title}`}</p>
            {first.sleeps > 0 && (
              <div className="dt-moons" aria-label={`${first.sleeps} moons`}>
                {Array.from({ length: Math.min(first.sleeps, MAX_MOONS) }, (_, i) => (
                  <span key={i} className="dt-moon">
                    <Icon name="moon" size={prereader ? 40 : 32} />
                  </span>
                ))}
                {first.sleeps > MAX_MOONS && <span className="dt-more">+{first.sleeps - MAX_MOONS}</span>}
              </div>
            )}
            <PressButton round aria-label="Read it to me" className="dt-speak" onClick={() => speak(spoken(first.sleeps, first.title))}>
              <Icon name="speaker" size={36} />
            </PressButton>
          </TaskCard>
        ) : (
          <TaskCard className="dt-hero">
            <Sticker art="star" size={140} decorative />
            <p className="dk-title dt-hero__until">Nothing on the calendar yet.</p>
          </TaskCard>
        )}
        {rest.length > 0 && (
          <div className="dt-rest">
            {rest.map((c) => (
              <Panel key={c.key} className="dt-item">
                <Sticker art={isArtKey(c.icon) ? c.icon : 'star'} size={64} decorative />
                <span className="dt-item__text">
                  <span className="dt-item__title">{c.title}</span>
                  <span className="dk-muted">{sleepsLabel(c.sleeps)}</span>
                </span>
              </Panel>
            ))}
          </div>
        )}
      </KidFrame>
    </KidTheme>
  );
}
