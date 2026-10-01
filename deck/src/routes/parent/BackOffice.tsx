import { useSession } from '../../lib/session';
import { PressButton } from '../../ui/PressButton';
import { Panel } from '../../ui/surfaces';
import { Headline } from '../../ui/type';
import { DataSection } from './office/DataSection';
import { DevicesSection } from './office/DevicesSection';
import { FamilySection } from './office/FamilySection';
import { AboutSection } from './office/AboutSection';
import { KidsSection } from './office/KidsSection';
import { ModulesSection } from './office/ModulesSection';
import { ParentsSection } from './office/ParentsSection';
import { RoutinesSection } from './office/RoutinesSection';

export function BackOffice() {
  const { who, signOut } = useSession();
  if (who.role !== 'parent') return null;
  return (
    <>
      <header className="parent-head">
        <Headline size={40}>Back Office</Headline>
        <p className="dk-muted">Parents only.</p>
      </header>
      <KidsSection familyId={who.familyId} />
      <RoutinesSection familyId={who.familyId} />
      <DevicesSection familyId={who.familyId} />
      <ParentsSection familyId={who.familyId} myUserId={who.userId} />
      <FamilySection familyId={who.familyId} name={who.familyName} />
      <ModulesSection familyId={who.familyId} />
      <DataSection familyName={who.familyName} />
      <Panel className="p-section">
        <h2 className="p-section__title">You</h2>
        <p className="dk-muted">Signed in as {who.email}.</p>
        <div className="p-actions">
          <PressButton onClick={() => void signOut()}>Sign out</PressButton>
        </div>
      </Panel>
      <AboutSection />
    </>
  );
}
