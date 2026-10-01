import { useSession } from '../lib/session';
import { PressButton } from '../ui/PressButton';
import { AuthLayout } from './AuthLayout';

/** A revoked iPad: it can see that it was unpaired, and nothing else. */
export function Unpaired() {
  const { who, signOut } = useSession();
  const label = who.role === 'revoked' ? who.label : 'This iPad';
  return (
    <AuthLayout title="Unpaired" mascot="turtle">
      <p>{label} was unpaired by a parent. To use it again, a parent can pair it with a new code.</p>
      <PressButton variant="ink" block onClick={() => void signOut()}>
        Pair again
      </PressButton>
    </AuthLayout>
  );
}
