import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { RootTheme } from '../theme/ThemeScope';
import { Headline } from '../ui/type';
import { getCurrentKid } from './currentKid';
import { KidHome } from './KidHome';
import { Picker } from './Picker';
import { KidStoreProvider, useKidStore } from './store';

function FirstLoad() {
  return (
    <RootTheme ground="night" volume="focus">
      <main className="kid" style={{ placeContent: 'center', alignItems: 'center' }} aria-busy="true">
        <Headline size={44}>Getting ready…</Headline>
      </main>
    </RootTheme>
  );
}

/** A kid's own screens. Only the kid picked (and PIN-unlocked) on this iPad can open them. */
function KidScope() {
  const { kidId } = useParams();
  const { snapshot } = useKidStore();
  const kid = snapshot!.kids.find((k) => k.id === kidId);
  if (!kid || getCurrentKid() !== kid.id) return <Navigate to="/kid" replace />;
  return (
    <Routes>
      <Route index element={<KidHome kid={kid} />} />
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
