import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { accentVar, type Kid } from '../lib/types';
import { Icon } from '../ui/Icon';
import { PressButton } from '../ui/PressButton';
import { Headline } from '../ui/type';
import { useLogUsage } from './usage';
import './kid.css';

/**
 * The frame every kid screen except home uses: Home is one tap away, and Wave Check is always
 * reachable (it can never be hidden by a mode). One task goes in the middle.
 */
export function KidFrame({ kid, title, children, wave = true, className = '' }: { kid: Kid; title: string; children: ReactNode; wave?: boolean; className?: string }) {
  const nav = useNavigate();
  const log = useLogUsage(kid.id);
  return (
    <main className={`kid ${className}`} data-audience="kid" data-age={kid.age_band} style={{ '--accent': accentVar(kid.accent) } as CSSProperties}>
      <header className="kid__bar frame__bar">
        <PressButton className="frame__btn" aria-label="Home" onClick={() => nav(`/kid/${kid.id}`)}>
          <Icon name="home" size={34} /> <span className="frame__btn-text">Home</span>
        </PressButton>
        <Headline size={kid.age_band === 'prereader' ? 40 : 44} small>
          {title}
        </Headline>
        {wave ? (
          <PressButton
            className="frame__btn"
            aria-label="Wave Check"
            onClick={() => {
              log('wave_check', 'opened');
              nav(`/kid/${kid.id}/wave`);
            }}
          >
            <Icon name="waves" size={34} /> <span className="frame__btn-text">Wave Check</span>
          </PressButton>
        ) : (
          <span className="frame__spacer" />
        )}
      </header>
      {children}
    </main>
  );
}
