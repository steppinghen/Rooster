import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { loadModules, parentModules, type ResolvedModule } from '../../lib/modules';
import { useSession } from '../../lib/session';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { RootTheme } from '../../theme/ThemeScope';
import { usePreferredGround } from '../../theme/usePreferredGround';
import type { IconName } from '../../ui/Icon';
import { NavBar, type NavItem } from '../../ui/NavBar';
import './parent.css';

// Where each parent-facing module lives. Modules without a screen yet are skipped.
const ROUTES: Record<string, string> = { today: '/parent', tour_dates: '/parent/dates', back_office: '/parent/office' };

export function ParentShell({ children }: { children: ReactNode }) {
  const { who } = useSession();
  const ground = usePreferredGround();
  const wide = useMediaQuery('(min-width: 1000px)');
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [modules, setModules] = useState<ResolvedModule[]>([]);
  const familyId = who.role === 'parent' ? who.familyId : null;

  useEffect(() => {
    if (familyId) void loadModules(familyId).then(setModules).catch(() => setModules([]));
  }, [familyId]);

  const items: NavItem[] = parentModules(modules)
    .filter((m) => ROUTES[m.key])
    .map((m) => ({ key: m.key, label: m.label, icon: m.icon as IconName, spacerBefore: m.key === 'back_office' }));
  const current = Object.entries(ROUTES).find(([, path]) => (path === '/parent' ? pathname === path : pathname.startsWith(path)))?.[0] ?? 'today';

  return (
    <RootTheme ground={ground} volume="normal">
      <div className={wide ? 'parent parent--wide' : 'parent'} data-audience="parent">
        {wide && items.length > 0 && <NavBar variant="rail" items={items} current={current} onSelect={(k) => nav(ROUTES[k]!)} />}
        <main className="parent__main">{children}</main>
        {!wide && items.length > 0 && (
          <div className="parent__tabs">
            <NavBar variant="tabs" items={items} current={current} onSelect={(k) => nav(ROUTES[k]!)} />
          </div>
        )}
      </div>
    </RootTheme>
  );
}
