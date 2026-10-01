import type { ReactNode } from 'react';
import { RootTheme } from '../theme/ThemeScope';
import { usePreferredGround } from '../theme/usePreferredGround';
import { Sticker } from '../ui/Sticker';
import { Headline } from '../ui/type';
import './auth.css';

/** Centered card for sign-in, MFA, pairing and other setup screens. */
export function AuthLayout({ title, children, mascot = 'rooster' }: { title: string; children: ReactNode; mascot?: 'rooster' | 'turtle' }) {
  const ground = usePreferredGround();
  return (
    <RootTheme ground={ground} volume="normal">
      <main className="auth">
        <div className="auth__head">
          <Sticker art={mascot} size={88} decorative />
          <Headline size={40}>{title}</Headline>
        </div>
        <div className="dk-card auth__card">{children}</div>
      </main>
    </RootTheme>
  );
}
