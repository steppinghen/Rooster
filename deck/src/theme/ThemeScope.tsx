import { createContext, useContext, useEffect, type CSSProperties, type ReactNode } from 'react';
import type { Ground, Scene, Volume } from './volume';

type Theme = { volume: Volume; ground: Ground; scene: Scene };

const ThemeContext = createContext<Theme>({ volume: 'normal', ground: 'night', scene: 'default' });

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Last Run and Lights out are always night, whatever the ground setting. */
function resolve(theme: Theme): Theme {
  return theme.scene === 'lastrun' ? { ...theme, ground: 'night' } : theme;
}

/** Sets the theme on <html>. One per app; screens never set volume or ground themselves. */
export function RootTheme({
  volume,
  ground,
  scene = 'default',
  children,
}: {
  volume: Volume;
  ground: Ground;
  scene?: Scene;
  children: ReactNode;
}) {
  const theme = resolve({ volume, ground, scene });
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.volume = theme.volume;
    el.dataset.ground = theme.ground;
    el.dataset.scene = theme.scene;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', theme.ground === 'day' ? '#F2E6CC' : '#15122E');
    if (!el.dataset.themeReady) requestAnimationFrame(() => requestAnimationFrame(() => (el.dataset.themeReady = '1')));
  }, [theme.volume, theme.ground, theme.scene]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** A nested theme region (styleguide matrix, a normal-volume celebration over a focus screen). */
export function ThemeScope({
  volume,
  ground,
  scene = 'default',
  className,
  style,
  children,
  ...rest
}: {
  volume: Volume;
  ground: Ground;
  scene?: Scene;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  const theme = resolve({ volume, ground, scene });
  return (
    <ThemeContext.Provider value={theme}>
      <div
        className={className}
        style={style}
        data-volume={theme.volume}
        data-ground={theme.ground}
        data-scene={theme.scene}
        {...rest}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
