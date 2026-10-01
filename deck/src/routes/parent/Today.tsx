import { useSession } from '../../lib/session';
import { Headline, Marker } from '../../ui/type';

/** Parent home. The full "today at a glance" dashboard lands in slice 11. */
export function Today() {
  const { who } = useSession();
  if (who.role !== 'parent') return null;
  const day = new Date().toLocaleDateString(undefined, { weekday: 'long', timeZone: who.timezone });
  return (
    <header className="parent-head">
      <Marker>{who.familyName}</Marker>
      <Headline size={56}>{day}</Headline>
      <p className="dk-muted">Hi, {who.displayName}.</p>
    </header>
  );
}
