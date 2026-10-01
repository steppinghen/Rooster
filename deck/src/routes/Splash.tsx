import { RootTheme } from '../theme/ThemeScope';
import { usePreferredGround } from '../theme/usePreferredGround';
import { Headline } from '../ui/type';

export function Splash() {
  const ground = usePreferredGround();
  return (
    <RootTheme ground={ground} volume="focus">
      <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }} aria-busy="true">
        <Headline size={36}>The Deck</Headline>
      </main>
    </RootTheme>
  );
}
