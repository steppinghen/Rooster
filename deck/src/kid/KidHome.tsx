import type { Kid } from '../lib/types';
import { KidTheme } from './KidTheme';
import { Headline } from '../ui/type';

/** Placeholder until slice 5 builds Grom Zone. */
export function KidHome({ kid }: { kid: Kid }) {
  return (
    <KidTheme kid={kid}>
      <main className="kid" data-audience="kid" data-age={kid.age_band}>
        <Headline size={52}>Grom Zone</Headline>
        <p className="kid__note">Hi, {kid.nickname}!</p>
      </main>
    </KidTheme>
  );
}
