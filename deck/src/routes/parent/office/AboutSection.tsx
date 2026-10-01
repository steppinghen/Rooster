import { Panel } from '../../../ui/surfaces';

/** Credits (ASSETS.md has the full list). */
export function AboutSection() {
  return (
    <Panel className="p-section" data-testid="about">
      <h2 className="p-section__title">About</h2>
      <p className="dk-muted">The Deck is our family's own app. No ads, no trackers, nothing sent anywhere but our own server.</p>
      <ul className="p-credits">
        <li>Art: Microsoft Fluent Emoji (MIT license).</li>
        <li>Fonts: Archivo, Archivo Black and Lexend (SIL Open Font License); Permanent Marker (Apache 2.0).</li>
        <li>Scenes and game pieces from Kenney.nl (CC0), when we add them.</li>
        <li>Icons and the rooster-and-turtle deck art: our own.</li>
      </ul>
    </Panel>
  );
}
