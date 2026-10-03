// Read-aloud with the browser's on-device Web Speech API (no external service).
// iOS only speaks after a user gesture, so every call here comes from a tap handler.

let voice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (voice !== undefined) return voice;
  const voices = typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : [];
  voice = voices.find((v) => v.lang.startsWith('en') && v.localService) ?? voices.find((v) => v.lang.startsWith('en')) ?? null;
  return voice;
}

// iOS lets a page speak only after a tap, and forgets on every reload (it reloads the app on
// app switch). The first tap after a load unlocks it; spoken-by-itself lines wait for that.
let unlocked = false;
if (typeof document !== 'undefined') {
  // Safari counts pointerup / touchend (not pointerdown) as the activation, and wants a speak()
  // inside it: an empty utterance primes the engine without making a sound.
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    try {
      if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    } catch {
      /* speech is a bonus */
    }
    for (const t of ['pointerup', 'touchend'] as const) document.removeEventListener(t, unlock, true);
  };
  for (const t of ['pointerup', 'touchend'] as const) document.addEventListener(t, unlock, true);
}

/** True once a tap in this page load has unlocked speech. */
export function speechUnlocked(): boolean {
  return unlocked;
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text: string, opts: { rate?: number } = {}) {
  if (!canSpeak()) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = opts.rate ?? 0.92; // a touch slower for young listeners
    u.pitch = 1.05;
    speechSynthesis.speak(u);
  } catch {
    /* speech is a bonus; never block the screen on it */
  }
}

export function stopSpeaking() {
  if (canSpeak()) speechSynthesis.cancel();
}
