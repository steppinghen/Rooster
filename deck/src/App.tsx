import { Link, Route, Routes } from 'react-router-dom';
import { Styleguide } from './routes/Styleguide';
import { RootTheme } from './theme/ThemeScope';
import { Headline } from './ui/type';

function Placeholder() {
  return (
    <RootTheme ground="night" volume="normal">
      <main style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Headline>The Deck</Headline>
        <p className="dk-muted">Phase 1 scaffold. Sign-in arrives in slice 2.</p>
        <Link to="/styleguide" style={{ color: 'var(--marker)', fontWeight: 800 }}>
          Open the styleguide
        </Link>
      </main>
    </RootTheme>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/styleguide" element={<Styleguide />} />
      <Route path="*" element={<Placeholder />} />
    </Routes>
  );
}
