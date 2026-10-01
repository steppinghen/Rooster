import { useEffect, useState } from 'react';
import { buildExportZip, type FamilyExport } from '../../../lib/exportZip';
import { useSession } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { Notice, TextField } from '../../../ui/forms';
import { PressButton } from '../../../ui/PressButton';
import { Panel } from '../../../ui/surfaces';

type Ready = { url: string; file: File };

/** Export everything (one zip) and delete everything (typed confirmation). */
export function DataSection({ familyName }: { familyName: string }) {
  const { signOut } = useSession();
  const [ready, setReady] = useState<Ready | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [danger, setDanger] = useState(false);
  const [confirm, setConfirm] = useState('');

  useEffect(
    () => () => {
      if (ready) URL.revokeObjectURL(ready.url);
    },
    [ready],
  );

  async function exportAll() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('export_family');
    setBusy(false);
    if (error) return setError(error.message);
    const ex = data as FamilyExport;
    const bytes = buildExportZip(ex);
    const name = `the-deck-export-${ex.exported_at.slice(0, 10)}.zip`;
    const file = new File([bytes.slice().buffer], name, { type: 'application/zip' });
    setReady({ url: URL.createObjectURL(file), file });
  }

  async function share() {
    if (!ready) return;
    try {
      await navigator.share({ files: [ready.file], title: ready.file.name });
    } catch {
      /* cancelled */
    }
  }

  async function deleteAll() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('delete_family', { p_confirm: confirm });
    setBusy(false);
    if (error) return setError(error.message);
    await signOut();
  }

  const canShare = !!ready && typeof navigator.canShare === 'function' && navigator.canShare({ files: [ready.file] });

  return (
    <Panel className="p-section">
      <h2 className="p-section__title">Your data</h2>
      <p className="dk-muted">One zip with every table as JSON (enough to rebuild from) plus readable CSVs. PINs are left out on purpose.</p>
      <div className="p-actions">
        <PressButton variant="yellow" onClick={() => void exportAll()} disabled={busy}>
          {busy && !danger ? 'Packing…' : 'Export all family data'}
        </PressButton>
        {ready && canShare && (
          <PressButton onClick={() => void share()}>Save or share…</PressButton>
        )}
        {ready && (
          <a className="dk-btn dk-btn--sm" href={ready.url} download={ready.file.name} data-testid="export-download">
            Download {ready.file.name}
          </a>
        )}
      </div>

      {!danger ? (
        <div className="p-actions">
          <PressButton small onClick={() => setDanger(true)}>
            Delete family…
          </PressButton>
        </div>
      ) : (
        <div className="dk-card p-section p-danger">
          <h3 className="p-section__title">Delete everything</h3>
          <p>
            This removes the whole family: kids, routines, Tour Dates, check-ins, history, both parents' accounts and every paired iPad. It can't be undone. Export first if you want a copy.
          </p>
          <TextField label={`Type "${familyName}" to confirm`} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          <div className="p-actions">
            <PressButton variant="ink" disabled={busy || confirm !== familyName} onClick={() => void deleteAll()}>
              Delete the family
            </PressButton>
            <PressButton onClick={() => (setDanger(false), setConfirm(''))}>Keep it</PressButton>
          </div>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </Panel>
  );
}
