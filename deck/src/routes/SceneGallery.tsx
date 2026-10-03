import { useState } from 'react';
import { artUrl } from '../art/original';
import { BreathingWave, IdleMascot, SceneStill, TrimEntrance } from '../scenes/AmbientScenes';
import { Celebration } from '../scenes/Celebration';
import { HeadsUp } from '../scenes/HeadsUp';
import { LightsOutScene } from '../scenes/LightsOutScene';
import { PawSlap, QuietReveal } from '../scenes/StickerScenes';
import { CELEBRATIONS, type Celebration as Kind } from '../scenes/timeline';
import { useIdleTurn } from '../scenes/useIdleTurn';
import { ThemeScope } from '../theme/ThemeScope';
import { DieCut } from '../ui/DieCut';
import { PressButton } from '../ui/PressButton';
import '../scenes/scenes.css';

const sticker = (size: number) => (
  <DieCut size={size}>
    <img src={artUrl('stickers/surf', 'surfboard', 'lg')} alt="" />
  </DieCut>
);

/**
 * Styleguide: every scene, playable on demand (data-testid sg-scene-<name>), so the e2e can
 * drive them with a pinned clock. Reduce Motion is the browser's setting.
 */
export function SceneGallery({ reduced }: { reduced: boolean }) {
  const [run, setRun] = useState<{ name: string; n: number } | null>(null);
  const [celebration, setCelebration] = useState<Kind>('pop');
  const [switchAt] = useState(() => Date.now() + 120_000);
  const [now, setNow] = useState(() => Date.now());
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const turn = useIdleTurn(['rooster', 'turtle', 'dog'], reduced);
  const play = (name: string) => setRun((r) => ({ name, n: (r?.n ?? 0) + 1 }));
  const playing = (name: string) => run?.name === name;
  return (
    <ThemeScope ground="day" volume="normal" className="sg-scope sg-scenes" data-testid="sg-scenes" data-audience="kid">
      <div className="sg-row sg-wrap">
        {CELEBRATIONS.map((c) => (
          <PressButton key={c} small variant={celebration === c ? 'yellow' : 'card'} onClick={() => { setCelebration(c); play('celebration'); }} data-testid={`sg-play-${c}`}>
            {c}
          </PressButton>
        ))}
        {['slap-left', 'slap-right', 'reveal', 'lights', 'snow', 'trim'].map((n) => (
          <PressButton key={n} small onClick={() => play(n)} data-testid={`sg-play-${n}`}>
            {n}
          </PressButton>
        ))}
        <PressButton small onClick={() => setNow(Date.now() + 106_000)} data-testid="sg-headsup-late">
          heads-up at 1:46
        </PressButton>
        <PressButton small onClick={() => setPhase((p) => (p === 'in' ? 'out' : 'in'))} data-testid="sg-breathe-toggle">
          breathe {phase}
        </PressButton>
      </div>

      {playing('celebration') && <Celebration key={run!.n} kind={celebration} title="Dawn Patrol done!" reduced={reduced} onDone={() => setRun(null)} />}

      <div className="sg-scene-row">
        <div className="sg-deck" data-testid="sg-scene-slap">
          {playing('slap-left') && <PawSlap key={run!.n} spot={{ x: 0.3, y: 0.5 }} sticker={sticker(90)} size={90} tilt={-8} reduced={reduced} onDone={() => setRun(null)} />}
          {playing('slap-right') && <PawSlap key={run!.n} spot={{ x: 0.72, y: 0.45 }} sticker={sticker(90)} size={90} tilt={7} reduced={reduced} onDone={() => setRun(null)} />}
        </div>
        <ThemeScope ground="night" volume="focus" scene="lastrun" className="sg-scene-box" data-testid="sg-scene-reveal">
          {playing('reveal') && <QuietReveal key={run!.n} sticker={sticker(150)} name="A surfboard!" onSpeak={() => {}} reduced={reduced} onDone={() => setRun(null)} />}
        </ThemeScope>
        <ThemeScope ground="night" volume="focus" scene="lastrun" className="sg-scene-box sg-scene-box--lights" data-testid="sg-scene-lights">
          {(playing('lights') || playing('snow')) && <LightsOutScene key={run!.n} winter={playing('snow')} reduced={reduced} play />}
        </ThemeScope>
      </div>

      <div className="sg-scene-row">
        <div data-testid="sg-scene-headsup" className="sg-scene-wide">
          <HeadsUp line="Two more minutes, then it's learning time." switchAt={switchAt} now={now} reduced={reduced} autoSpeak={false} onSpeak={() => {}} kidColor="var(--cyan)" />
        </div>
        <div data-testid="sg-scene-breathe">
          <BreathingWave phase={phase} reduced={reduced} />
        </div>
      </div>

      <div className="sg-scene-row" data-testid="sg-scene-idle">
        <IdleMascot who="rooster" px={110} turn={turn} />
        <IdleMascot who="turtle" px={110} turn={turn} />
        <IdleMascot who="dog" px={110} turn={turn} />
        {playing('trim') && (
          <TrimEntrance key={run!.n} id={`sg-${run!.n}`} today="sg" reduced={reduced}>
            <img src={artUrl('holidays/halloween', 'trim.portrait.day', 'lg')} alt="" width={420} />
          </TrimEntrance>
        )}
      </div>
      <div className="sg-scene-row">
        <SceneStill kind="morning" name="Kid A" />
        <SceneStill kind="session" name="Kid A" />
        <SceneStill kind="lastrun" name="Kid A" />
      </div>
    </ThemeScope>
  );
}
