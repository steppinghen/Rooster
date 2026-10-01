import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { kidVisibleModules } from '../lib/moduleRules';
import { effectiveFocus } from './focus';
import { FocusLayer } from './modes/FocusLayer';
import { LightsOut } from './modes/LightsOut';
import { Session } from './modes/Session';
import { useNow } from './useNow';
import { RootTheme } from '../theme/ThemeScope';
import { PressButton } from '../ui/PressButton';
import { Headline } from '../ui/type';
import { getCurrentKid } from './currentKid';
import { KidHome } from './KidHome';
import { TourDates } from './TourDates';
import { Breathe } from './wave/Breathe';
import { ResetPlan } from './wave/ResetPlan';
import { WaveCheck } from './wave/WaveCheck';
import { Picker } from './Picker';
import { RoutineRun } from './RoutineRun';
import { Routines } from './Routines';
import { KidStoreProvider, useKidStore } from './store';

function FirstLoad() {
  const { firstLoadFailed, refresh } = useKidStore();
  return (
    <RootTheme ground="night" volume="focus">
      <main className="kid" style={{ placeContent: 'center', alignItems: 'center' }} aria-busy={!firstLoadFailed}>
        <Headline size={44}>{firstLoadFailed ? "Can't reach The Deck" : 'Getting ready…'}</Headline>
        {firstLoadFailed && (
          <>
            <p className="kid__note">Check the Wi-Fi. Once it has loaded once, this iPad keeps working offline.</p>
            <PressButton variant="yellow" onClick={() => void refresh()}>
              Try again
            </PressButton>
          </>
        )}
      </main>
    </RootTheme>
  );
}

// Which module each kid screen belongs to. A screen whose module is hidden (by the family's
// switches or the kid's focus mode) can't be reached, not even by typing its address.
const SCREEN_MODULE: Record<string, string> = { routines: 'routines', routine: 'routines', dates: 'tour_dates', session: 'session', wave: 'wave_check', breathe: 'wave_check', reset: 'wave_check' };

/** A kid's own screens. Only the kid picked (and PIN-unlocked) on this iPad can open them. */
function KidScope() {
  const { kidId } = useParams();
  const { snapshot } = useKidStore();
  const { pathname } = useLocation();
  const now = useNow(1000);
  const kid = snapshot!.kids.find((k) => k.id === kidId);
  if (!kid || getCurrentKid() !== kid.id) return <Navigate to="/kid" replace />;
  const focus = effectiveFocus(snapshot!.focus.find((f) => f.kid_id === kid.id), now);
  const screen = pathname.split('/')[3] ?? '';
  const visible = new Set(kidVisibleModules(snapshot!.modules, focus.mode).map((m) => m.key));
  if (screen && SCREEN_MODULE[screen] && !visible.has(SCREEN_MODULE[screen]!)) return <Navigate to={`/kid/${kid.id}`} replace />;
  // Lights out: the bedtime screen and nothing else, except breathing (Wave Check is never locked out).
  if (focus.mode === 'lights_out' && !['breathe', 'wave', 'reset'].includes(screen)) {
    return (
      <>
        <LightsOut kid={kid} />
        <FocusLayer kid={kid} />
      </>
    );
  }
  return (
    <>
      <KidRoutesFor kid={kid} lightsOut={focus.mode === 'lights_out'} />
      <FocusLayer kid={kid} />
    </>
  );
}

function KidRoutesFor({ kid, lightsOut }: { kid: import('../lib/types').Kid; lightsOut: boolean }) {
  return (
    <Routes>
      <Route index element={<KidHome kid={kid} />} />
      <Route path="routines" element={<Routines kid={kid} />} />
      <Route path="dates" element={<TourDates kid={kid} />} />
      <Route path="wave" element={<WaveCheck kid={kid} />} />
      <Route path="breathe" element={<Breathe kid={kid} lightsOut={lightsOut} />} />
      <Route path="session" element={<Session kid={kid} />} />
      <Route path="reset" element={<ResetPlan kid={kid} />} />
      <Route path="routine/:routineId" element={<RoutineRun kid={kid} />} />
      <Route path="*" element={<Navigate to={`/kid/${kid.id}`} replace />} />
    </Routes>
  );
}

function KidRoutes() {
  const { snapshot } = useKidStore();
  // Only the very first launch, before anything is cached, waits on the network.
  if (!snapshot) return <FirstLoad />;
  return (
    <Routes>
      <Route index element={<Picker />} />
      <Route path=":kidId/*" element={<KidScope />} />
    </Routes>
  );
}

export function KidApp() {
  return (
    <KidStoreProvider>
      <KidRoutes />
    </KidStoreProvider>
  );
}
