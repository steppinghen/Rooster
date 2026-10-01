import { useState, type CSSProperties } from 'react';
import { ART_KEYS, type ArtKey, type ArtStyle } from '../art/art';
import { RootTheme, ThemeScope } from '../theme/ThemeScope';
import type { Ground, Volume } from '../theme/volume';
import { AvatarChip } from '../ui/AvatarChip';
import { Burst } from '../ui/Burst';
import { DaySun } from '../ui/DaySun';
import { Icon } from '../ui/Icon';
import { NavBar, type NavItem } from '../ui/NavBar';
import { PressButton } from '../ui/PressButton';
import { ProgressDots } from '../ui/ProgressDots';
import { Sticker } from '../ui/Sticker';
import { AccentBlock, Panel, TaskCard } from '../ui/surfaces';
import { Tile } from '../ui/Tile';
import { Headline, Marker } from '../ui/type';
import './styleguide.css';

const COMBOS: { ground: Ground; volume: Volume }[] = [
  { ground: 'night', volume: 'normal' },
  { ground: 'night', volume: 'focus' },
  { ground: 'day', volume: 'normal' },
  { ground: 'day', volume: 'focus' },
];

const ART_LABELS: Record<ArtKey, string> = {
  rooster: 'Rooster',
  turtle: 'Turtle',
  pumping: 'Pumping',
  rolling: 'Rolling',
  flat: 'Flat',
  choppy: 'Choppy',
  toothbrush: 'Brush teeth',
  shirt: 'Get dressed',
};

const NAV: NavItem[] = [
  { key: 'today', label: 'Today', icon: 'sun' },
  { key: 'grom', label: 'Grom Zone', icon: 'board' },
  { key: 'dates', label: 'Tour Dates', icon: 'calendar' },
  { key: 'wave', label: 'Wave Check', icon: 'waves' },
  { key: 'office', label: 'Back Office', icon: 'lock', spacerBefore: true },
];

const KID_ACCENT = { '--accent': 'var(--magenta)' } as CSSProperties;

function Toggle<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: T[]; onChange: (v: T) => void }) {
  return (
    <div className="sg-toggle" role="group" aria-label={label}>
      <span className="sg-toggle__label">{label}</span>
      {options.map((o) => (
        <PressButton key={o} small variant={o === value ? 'yellow' : 'card'} aria-pressed={o === value} onClick={() => onChange(o)}>
          {o}
        </PressButton>
      ))}
    </div>
  );
}

/** Every base component, once. Rendered inside whatever theme scope wraps it. */
function ComponentSet({ age = 'reader' }: { age?: 'reader' | 'prereader' }) {
  return (
    <div className="sg-set" style={KID_ACCENT} data-age={age} data-audience="kid">
      <DaySun />
      <div className="sg-row sg-row--between">
        <Headline size={44}>Grom Zone</Headline>
        <AvatarChip initial="B" accent="var(--magenta)" label="Kid B" />
      </div>
      <Marker>Good morning · 6:45 am</Marker>

      <div className="sg-row">
        <TaskCard className="sg-bubble" tilt="-2deg">
          <span className="dk-title" style={{ fontSize: 30 }}>
            3 more steps!
          </span>
        </TaskCard>
      </div>
      <ProgressDots total={6} done={3} size={56} />

      <AccentBlock className="sg-upnext">
        <span className="sg-upnext__icon">
          <Icon name="sparkle" size={44} />
        </span>
        <span className="sg-upnext__text">
          <span className="dk-label">Up next</span>
          <span className="dk-title sg-upnext__title">
            Brush teeth
          </span>
        </span>
        <PressButton round aria-label="Read it to me" style={{ width: 72, height: 72 }}>
          <Icon name="speaker" size={32} />
        </PressButton>
      </AccentBlock>

      <PressButton variant="ink" block>
        <Icon name="check" size={30} strokeWidth={3.2} /> I did it!
      </PressButton>

      <div className="sg-row sg-wrap">
        <PressButton variant="accent">Accent</PressButton>
        <PressButton variant="yellow">Yellow</PressButton>
        <PressButton>Card</PressButton>
        <PressButton small>Small</PressButton>
      </div>

      <div className="sg-tiles">
        <Tile icon={<Icon name="waves" size={36} />} label="Wave Check" status="How are you?" />
        <Tile icon={<Icon name="calendar" size={36} />} label="Tour Dates" status="4 sleeps" />
        <Tile icon={<Icon name="breathe" size={36} />} label="Breathe" data-pressed="true" />
      </div>

      <Panel className="sg-panel">
        <Marker size={16}>On the board</Marker>
        <p className="dk-label" style={{ fontSize: 20 }}>
          Ink panel
        </p>
        <p className="dk-muted">Comic-panel card: night panel or day paper, ink outline, hard shadow.</p>
      </Panel>

      <div className="sg-row sg-wrap">
        <span className="dk-chip">
          <Icon name="lock" size={14} /> Focus mode
        </span>
        <span className="dk-tag">NOW</span>
        <AvatarChip initial="A" accent="var(--cyan)" size={56} label="Kid A" />
        <AvatarChip initial="B" accent="var(--magenta)" size={56} label="Kid B" />
      </div>

      <TaskCard className="sg-reading">
        <p className="reading">Tornadoes form when warm, wet air meets cold, dry air. (Lexend, reading text.)</p>
      </TaskCard>
    </div>
  );
}

function EmojiRow({ style }: { style: ArtStyle }) {
  return (
    <div className="sg-emoji">
      {ART_KEYS.map((k) => (
        <figure key={k} className="sg-emoji__item">
          <Sticker art={k} style={style} size={64} alt={ART_LABELS[k]} />
          <figcaption>{ART_LABELS[k]}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function Styleguide() {
  const [ground, setGround] = useState<Ground>('night');
  const [volume, setVolume] = useState<Volume>('normal');

  return (
    <RootTheme ground={ground} volume={volume}>
      <main className="sg">
        <header className="sg-header">
          <Headline size={40}>Styleguide</Headline>
          <div className="sg-row sg-wrap">
            <Toggle label="Ground" value={ground} options={['night', 'day']} onChange={setGround} />
            <Toggle label="Volume" value={volume} options={['normal', 'focus']} onChange={setVolume} />
          </div>
        </header>

        <section aria-labelledby="sg-emoji">
          <h2 id="sg-emoji" className="sg-h2">
            Emoji style test: 3D vs Flat
          </h2>
          <p className="sg-note">Same art, sticker treatment, every ground and volume. Pick one before feature screens use art.</p>
          <div className="sg-matrix">
            {COMBOS.map((c) => (
              <ThemeScope key={`${c.ground}-${c.volume}`} {...c} className="sg-scope" data-testid={`emoji-${c.ground}-${c.volume}`}>
                <p className="sg-scope__label">
                  {c.ground} · {c.volume}
                </p>
                <p className="sg-style-label">3D</p>
                <EmojiRow style="3d" />
                <p className="sg-style-label">Flat</p>
                <EmojiRow style="flat" />
              </ThemeScope>
            ))}
          </div>
        </section>

        <section aria-labelledby="sg-preview">
          <h2 id="sg-preview" className="sg-h2">
            Preview ({ground} · {volume})
          </h2>
          <p className="sg-note">Uses the root theme from the toggles above.</p>
          <div className="sg-scope sg-scope--root">
            <ComponentSet />
          </div>
        </section>

        <section aria-labelledby="sg-all">
          <h2 id="sg-all" className="sg-h2">
            All four combinations
          </h2>
          <div className="sg-matrix">
            {COMBOS.map((c) => (
              <ThemeScope key={`${c.ground}-${c.volume}`} {...c} className="sg-scope" data-testid={`set-${c.ground}-${c.volume}`}>
                <p className="sg-scope__label">
                  {c.ground} · {c.volume}
                </p>
                <ComponentSet />
              </ThemeScope>
            ))}
            <ThemeScope ground="day" volume="focus" scene="lastrun" className="sg-scope" data-testid="set-lastrun">
              <p className="sg-scope__label">Last Run (asked for day, always night)</p>
              <ComponentSet />
            </ThemeScope>
            <ThemeScope ground="night" volume="normal" className="sg-scope" data-testid="set-prereader">
              <p className="sg-scope__label">Pre-reader sizing (night · normal)</p>
              <ComponentSet age="prereader" />
            </ThemeScope>
          </div>
        </section>

        <section aria-labelledby="sg-celebrate">
          <h2 id="sg-celebrate" className="sg-h2">
            Celebration (always normal volume)
          </h2>
          <ThemeScope ground="night" volume="normal" className="sg-scope sg-celebrate">
            <Burst />
            <p className="dk-title" style={{ fontSize: 30 }}>
              Routine done.
            </p>
            <PressButton variant="yellow">Back to Grom Zone</PressButton>
          </ThemeScope>
        </section>

        <section aria-labelledby="sg-nav">
          <h2 id="sg-nav" className="sg-h2">
            Navigation
          </h2>
          <div className="sg-navs">
            <div className="sg-rail">
              <NavBar variant="rail" items={NAV} current="today" />
            </div>
            <div className="sg-tabs">
              <NavBar variant="tabs" items={NAV} current="grom" />
            </div>
          </div>
        </section>

        <section aria-labelledby="sg-tokens">
          <h2 id="sg-tokens" className="sg-h2">
            Tokens
          </h2>
          <div className="sg-swatches">
            {['ink', 'cream', 'paper', 'magenta', 'cyan', 'yellow', 'lime', 'lilac', 'orange', 'ground', 'surface', 'card', 'text', 'text-muted', 'marker', 'slot'].map((t) => (
              <div key={t} className="sg-swatch">
                <span className="sg-swatch__chip" style={{ background: `var(--${t})` }} />
                <code>--{t}</code>
              </div>
            ))}
          </div>
        </section>
      </main>
    </RootTheme>
  );
}
