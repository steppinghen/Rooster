import { useNavigate } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { PressButton } from '../ui/PressButton';
import { AuthLayout } from './AuthLayout';

export function Welcome() {
  const nav = useNavigate();
  return (
    <AuthLayout title="The Deck">
      <p>Our family home base.</p>
      <PressButton variant="ink" block onClick={() => nav('/parent/sign-in')}>
        <Icon name="lock" /> I'm a grown-up
      </PressButton>
      <PressButton variant="yellow" block onClick={() => nav('/pair')}>
        <Icon name="board" /> Set up this iPad for the kids
      </PressButton>
    </AuthLayout>
  );
}
