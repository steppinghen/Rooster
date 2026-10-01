import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SessionProvider, useSession, type Who } from './lib/session';
import { KidApp } from './kid/KidApp';
import { NoAccess } from './routes/NoAccess';
import { Pair } from './routes/Pair';
import { Unpaired } from './routes/Unpaired';
import { BackOffice } from './routes/parent/BackOffice';
import { ParentDates } from './routes/parent/Dates';
import { Join } from './routes/parent/Join';
import { Mfa } from './routes/parent/Mfa';
import { ParentShell } from './routes/parent/ParentShell';
import { Setup } from './routes/parent/Setup';
import { SignIn } from './routes/parent/SignIn';
import { Today } from './routes/parent/Today';
import { Splash } from './routes/Splash';
import { Styleguide } from './routes/Styleguide';
import { Welcome } from './routes/Welcome';

/** Where each kind of session belongs. Screens only route on this; RLS enforces it. */
function homeFor(who: Who): string {
  switch (who.role) {
    case 'signed_out':
      return '/welcome';
    case 'needs_mfa':
      return '/parent/mfa';
    case 'bootstrap':
      return '/parent/setup';
    case 'invited':
      return '/parent/join';
    case 'none':
      return '/no-access';
    case 'parent':
      return '/parent';
    case 'device':
      return '/kid';
    case 'revoked':
      return '/unpaired';
    case 'unpaired':
      return '/pair';
    default:
      return '/';
  }
}

/** Render `children` only for the listed roles; otherwise send the session home. */
function Only({ roles, children }: { roles: Who['role'][]; children: ReactNode }) {
  const { who } = useSession();
  const { pathname } = useLocation();
  if (who.role === 'loading') return <Splash />;
  if (!roles.includes(who.role)) {
    const home = homeFor(who);
    return home === pathname ? null : <Navigate to={home} replace />;
  }
  return <>{children}</>;
}

function Gate() {
  const { who } = useSession();
  if (who.role === 'loading') return <Splash />;
  return <Navigate to={homeFor(who)} replace />;
}

export function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/styleguide" element={<Styleguide />} />
        <Route path="/" element={<Gate />} />
        <Route path="/welcome" element={<Only roles={['signed_out']}><Welcome /></Only>} />
        <Route path="/parent/sign-in" element={<Only roles={['signed_out']}><SignIn /></Only>} />
        <Route path="/parent/mfa" element={<Only roles={['needs_mfa']}><Mfa /></Only>} />
        <Route path="/parent/setup" element={<Only roles={['bootstrap']}><Setup /></Only>} />
        <Route path="/parent/join" element={<Only roles={['invited']}><Join /></Only>} />
        <Route path="/no-access" element={<Only roles={['none']}><NoAccess /></Only>} />
        <Route path="/pair" element={<Only roles={['signed_out', 'unpaired']}><Pair /></Only>} />
        <Route path="/unpaired" element={<Only roles={['revoked']}><Unpaired /></Only>} />
        <Route path="/parent" element={<Only roles={['parent']}><ParentShell><Today /></ParentShell></Only>} />
        <Route path="/parent/dates" element={<Only roles={['parent']}><ParentShell><ParentDates /></ParentShell></Only>} />
        <Route path="/parent/office" element={<Only roles={['parent']}><ParentShell><BackOffice /></ParentShell></Only>} />
        <Route path="/kid/*" element={<Only roles={['device']}><KidApp /></Only>} />
        <Route path="*" element={<Gate />} />
      </Routes>
    </SessionProvider>
  );
}
