import { assertStackUp, AGENT } from './helpers/agent';
import { addKids, makeParent } from './helpers/fixtures';

// Realtime warm-up, once per run before any test, so no test's few-second window pays for the
// first private broadcast on a freshly started stack, and a broken Realtime fails the run here
// with a clear message. Drives one real signal end to end: a parent joins its family topic, adds
// a kid (the kids trigger sends "changed"), and we wait until the message arrives.
// (focus-modes.spec.ts's first-test failure turned out to be the app, not Realtime: see
// session-offline.spec.ts.)
export default async function globalSetup() {
  assertStackUp();
  const deadline = Date.now() + 60_000;
  const parent = await makeParent({ familyName: 'Family A' });
  await parent.db.realtime.setAuth();
  let heard = false;
  const channel = parent.db.channel(`family:${parent.familyId}`, { config: { private: true } }).on('broadcast', { event: 'changed' }, () => {
    heard = true;
  });
  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') resolve();
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`Realtime warm-up on ${AGENT}: ${status} ${err ?? ''}`));
    });
  });
  for (let n = 0; !heard && Date.now() < deadline; n++) {
    await addKids(parent, [{ nickname: `Kid ${String.fromCharCode(65 + (n % 3))}`, age_band: 'reader' }]);
    for (let i = 0; i < 20 && !heard; i++) await new Promise((r) => setTimeout(r, 100));
  }
  await parent.db.removeChannel(channel);
  await parent.db.auth.signOut();
  if (!heard) throw new Error(`Realtime warm-up on ${AGENT}: no broadcast within 60 s. Is the stack healthy?`);
}
