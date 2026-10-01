import { useSession } from '../lib/session';
import { PressButton } from '../ui/PressButton';
import { AuthLayout } from './AuthLayout';

export function NoAccess() {
  const { signOut } = useSession();
  return (
    <AuthLayout title="Not set up" mascot="turtle">
      <p>This email isn't part of a family on The Deck yet. Ask the parent who set it up to add your email, then sign in again.</p>
      <PressButton variant="ink" block onClick={() => void signOut()}>
        Sign out
      </PressButton>
    </AuthLayout>
  );
}
