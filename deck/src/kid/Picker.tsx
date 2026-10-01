import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Kid } from '../lib/types';
import { RootTheme } from '../theme/ThemeScope';
import { tiltFor } from '../theme/volume';
import { Icon } from '../ui/Icon';
import { KidAvatar } from '../ui/KidAvatar';
import { PressButton } from '../ui/PressButton';
import { Headline } from '../ui/type';
import { setCurrentKid } from './currentKid';
import { useDeviceGround } from './useDeviceGround';
import { PinPad } from './PinPad';
import { speak } from './speech';
import { useKidStore } from './store';
import { useNow } from './useNow';
import './kid.css';

/** "Who's riding?" Kids tap their own avatar. No passwords; an optional PIN for siblings. */
export function Picker() {
  const { snapshot, online } = useKidStore();
  const now = useNow(60_000);
  const ground = useDeviceGround(snapshot!, now);
  const nav = useNavigate();
  const [pinFor, setPinFor] = useState<Kid | null>(null);
  const [grownUps, setGrownUps] = useState(false);

  function choose(kid: Kid) {
    if (kid.has_pin) {
      speak(`${kid.nickname}. Type your secret code.`);
      setPinFor(kid);
      return;
    }
    speak(`Hi, ${kid.nickname}!`);
    setCurrentKid(kid.id);
    nav(`/kid/${kid.id}`);
  }

  if (pinFor) {
    return (
      <PinPad
        kid={pinFor}
        ground={ground}
        onCancel={() => setPinFor(null)}
        onUnlocked={() => {
          setCurrentKid(pinFor.id);
          nav(`/kid/${pinFor.id}`);
        }}
      />
    );
  }

  const kids = snapshot!.kids;
  return (
    <RootTheme ground={ground} volume="normal">
      <main className="kid kid--picker" data-audience="kid" data-age="prereader">
        <header className="kid__bar">
          <Headline size={52}>Who's riding?</Headline>
          <PressButton round aria-label="Read it to me" style={{ width: 80, height: 80 }} onClick={() => speak("Who's riding? Tap your picture.")}>
            <Icon name="speaker" size={34} />
          </PressButton>
        </header>

        <div className={kids.length > 2 ? 'picker-grid picker-grid--many' : 'picker-grid'}>
          {kids.map((k) => (
            <button key={k.id} type="button" className="dk-panel picker-kid" style={{ '--tilt': tiltFor(k.id, 2) } as React.CSSProperties} onClick={() => choose(k)} data-testid="pick-kid">
              <KidAvatar nickname={k.nickname} avatar={k.avatar} accent={k.accent} size={kids.length > 2 ? 140 : 180} />
              <span className="picker-kid__name">{k.nickname}</span>
              {k.has_pin && (
                <span className="picker-kid__lock" aria-label="has a secret code">
                  <Icon name="lock" size={22} />
                </span>
              )}
            </button>
          ))}
        </div>
        {kids.length === 0 && <p className="kid__note">A grown-up needs to add Team Riders in Back Office first.</p>}

        <footer className="kid__foot">
          {!online && <span className="dk-chip">Offline · still works</span>}
          {grownUps ? (
            <div className="dk-card kid__grownups">
              <p>Grown-up stuff lives on your phone: open The Deck and go to Back Office. This iPad has no parent controls.</p>
              <PressButton small onClick={() => setGrownUps(false)}>
                OK
              </PressButton>
            </div>
          ) : (
            <PressButton small onClick={() => setGrownUps(true)}>
              <Icon name="lock" size={20} /> Grown-ups
            </PressButton>
          )}
        </footer>
      </main>
    </RootTheme>
  );
}
