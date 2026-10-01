import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../../lib/supabase';
import { must, useAsync } from '../../../lib/useAsync';
import { Notice, Segmented, TextField } from '../../../ui/forms';
import { PressButton } from '../../../ui/PressButton';
import { Panel } from '../../../ui/surfaces';

type DeviceRow = { id: string; label: string; paired_at: string; revoked_at: string | null; last_seen_at: string | null; ground: string };
type OpenCode = { code: string; expiresAt: number; label: string };

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

/** Pair iPads with a 10-minute code; unpair from the phone. */
export function DevicesSection({ familyId }: { familyId: string }) {
  const devices = useAsync(
    async () => must(await supabase.from('devices').select('id, label, paired_at, revoked_at, last_seen_at, ground').eq('family_id', familyId).order('paired_at')) as DeviceRow[],
    [familyId],
  );
  const [label, setLabel] = useState('Kitchen iPad');
  const [open, setOpen] = useState<OpenCode | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tick the countdown and watch for the iPad to finish pairing.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => {
      setNow(Date.now());
      void devices.reload();
    }, 1000);
    return () => clearInterval(t);
  }, [open, devices]);

  const active = (devices.data ?? []).filter((d) => !d.revoked_at);
  const revoked = (devices.data ?? []).filter((d) => d.revoked_at);
  const remaining = open ? Math.max(0, Math.round((open.expiresAt - now) / 1000)) : 0;
  const pairedNow = open && active.some((d) => d.label === open.label && new Date(d.paired_at).getTime() > open.expiresAt - 600_000);

  async function getCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { data, error } = await supabase.rpc('create_pairing_code', { p_label: label.trim() });
    if (error) return setError(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as { code: string; expires_at: string };
    setOpen({ code: row.code, expiresAt: new Date(row.expires_at).getTime(), label: label.trim() });
  }

  async function revoke(id: string) {
    const { error } = await supabase.rpc('revoke_device', { p_device_id: id });
    if (error) setError(error.message);
    setConfirming(null);
    void devices.reload();
  }

  async function setGround(id: string, ground: string) {
    const { error } = await supabase.from('devices').update({ ground }).eq('id', id);
    if (error) setError(error.message);
    void devices.reload();
  }

  async function remove(id: string) {
    await supabase.from('devices').delete().eq('id', id);
    void devices.reload();
  }

  return (
    <Panel className="p-section">
      <h2 className="p-section__title">Devices</h2>
      {active.map((d) => (
        <div className="p-row p-row--wrap" key={d.id} data-testid="device-row">
          <div className="p-row__main">
            <span className="p-row__title">{d.label}</span>
            <span className="p-row__meta">Paired {new Date(d.paired_at).toLocaleDateString()} · seen {ago(d.last_seen_at)}</span>
          </div>
          {confirming === d.id ? (
            <span className="p-actions">
              <PressButton small variant="ink" onClick={() => void revoke(d.id)}>
                Unpair
              </PressButton>
              <PressButton small onClick={() => setConfirming(null)}>
                Keep
              </PressButton>
            </span>
          ) : (
            <PressButton small onClick={() => setConfirming(d.id)}>
              Unpair…
            </PressButton>
          )}
          <div className="p-row__full">
            <Segmented
              label={`Look on ${d.label}`}
              value={d.ground as 'auto' | 'day' | 'night' | 'device'}
              onChange={(g) => void setGround(d.id, g)}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'day', label: 'Day' },
                { value: 'night', label: 'Night' },
                { value: 'device', label: 'Follow iPad' },
              ]}
            />
          </div>
        </div>
      ))}
      {active.length === 0 && <p className="dk-muted">No iPads paired yet.</p>}
      {active.length > 0 && <p className="dk-muted">Auto: day from the start of the morning routine until bedtime begins. Bedtime and Lights out are always night.</p>}

      {open && remaining > 0 && !pairedNow ? (
        <div className="dk-card p-section" data-testid="pairing-code">
          <p>
            On the iPad, open The Deck, tap <strong>Set up this iPad</strong>, and type:
          </p>
          <p className="p-code" aria-label={`Pairing code ${open.code.split('').join(' ')}`}>
            {open.code.slice(0, 4)} {open.code.slice(4)}
          </p>
          <p className="dk-muted">
            Works once, for {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} more.
          </p>
          <PressButton small onClick={() => setOpen(null)}>
            Done
          </PressButton>
        </div>
      ) : (
        <>
          {pairedNow && <Notice tone="ok">{open!.label} is paired.</Notice>}
          <form onSubmit={getCode} className="p-actions" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 220px' }}>
              <TextField label="Pair an iPad" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} hint="A name you'll recognize, like Kitchen iPad." />
            </div>
            <PressButton variant="yellow" type="submit" disabled={!label.trim()}>
              Get a code
            </PressButton>
          </form>
        </>
      )}

      {revoked.length > 0 && (
        <details>
          <summary className="p-row__meta">Unpaired devices ({revoked.length})</summary>
          {revoked.map((d) => (
            <div className="p-row" key={d.id}>
              <div className="p-row__main">
                <span className="p-row__title">{d.label}</span>
                <span className="p-row__meta">Unpaired {new Date(d.revoked_at!).toLocaleDateString()}</span>
              </div>
              <PressButton small onClick={() => void remove(d.id)}>
                Forget
              </PressButton>
            </div>
          ))}
        </details>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </Panel>
  );
}
