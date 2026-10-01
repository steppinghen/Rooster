import { strToU8, zipSync } from 'fflate';

type Row = Record<string, unknown>;
export type FamilyExport = {
  format: string;
  version: number;
  exported_at: string;
  family: Row & { name: string; timezone: string };
  tables: Record<string, Row[]>;
  module_catalog: Row[];
  omitted: Record<string, string>;
};

/** RFC 4180 CSV: quote every field that needs it, CRLF line ends (opens cleanly in Numbers/Excel). */
export function toCsv(header: string[], rows: unknown[][]): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join('; ') : String(v);
    return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/**
 * The family export zip (CLAUDE.md req. 9): the full JSON dump of every table, CSVs for the
 * human-readable ones, and a README. No uploaded files exist yet in Phase 1.
 */
export function buildExportZip(ex: FamilyExport): Uint8Array {
  const t = ex.tables;
  const kids = new Map((t.kids ?? []).map((k) => [str(k.id), str(k.nickname)]));
  const routines = new Map((t.routines ?? []).map((r) => [str(r.id), r]));

  const files: Record<string, Uint8Array> = {
    'export.json': strToU8(JSON.stringify(ex, null, 2)),
    'events.csv': strToU8(
      toCsv(
        ['date', 'title', 'kind', 'shown to kids', 'every year', 'icon'],
        (t.events ?? []).map((e) => [e.on_date, e.title, e.kind, e.visible_to_kids ? 'yes' : 'no', e.repeats_yearly ? 'yes' : 'no', e.icon]),
      ),
    ),
    'kids.csv': strToU8(
      toCsv(
        ['nickname', 'screens', 'everyday look', 'color', 'avatar', 'birthday month', 'birthday day', 'has PIN'],
        (t.kids ?? []).map((k) => [k.nickname, k.age_band, k.default_volume, k.accent, k.avatar, k.birthday_month, k.birthday_day, k.has_pin ? 'yes' : 'no']),
      ),
    ),
    'routines.csv': strToU8(
      toCsv(
        ['routine', 'time of day', 'starts', 'for', 'step', 'step text', 'step icon'],
        (t.routines ?? []).flatMap((r) =>
          ((r.steps as { id: string; text: string; icon: string }[]) ?? []).map((s, i) => [r.name, r.slot, str(r.starts_at).slice(0, 5), r.kid_id ? kids.get(str(r.kid_id)) : 'everyone', i + 1, s.text, s.icon]),
        ),
      ),
    ),
    'routine_progress.csv': strToU8(
      toCsv(
        ['date', 'kid', 'routine', 'steps done', 'of', 'finished at'],
        (t.routine_completions ?? []).map((c) => {
          const r = routines.get(str(c.routine_id));
          return [c.on_date, kids.get(str(c.kid_id)), r?.name, (c.completed_steps as string[])?.length ?? 0, (r?.steps as unknown[])?.length ?? '', c.completed_at];
        }),
      ),
    ),
    'usage.csv': strToU8(
      toCsv(
        ['when', 'kid', 'module', 'action', 'target', 'duration (ms)'],
        (t.usage_events ?? []).map((u) => [u.created_at, u.kid_id ? kids.get(str(u.kid_id)) : 'parent', u.module_key, u.action, u.target_id, u.duration_ms]),
      ),
    ),
    'README.txt': strToU8(
      [
        `The Deck: family export for "${ex.family.name}"`,
        `Exported ${ex.exported_at} (format ${ex.format} v${ex.version}).`,
        '',
        'export.json  Every table, every row of this family. This is the file to rebuild from.',
        'events.csv, kids.csv, routines.csv, routine_progress.csv, usage.csv  Readable copies.',
        '',
        'Left out on purpose:',
        ...Object.entries(ex.omitted).map(([k, v]) => `  ${k}: ${v}`),
        '',
        'Feelings check-ins are in export.json only. Treat this file as private.',
      ].join('\r\n') + '\r\n',
    ),
  };
  const day = ex.exported_at.slice(0, 10);
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, data]) => [`the-deck-export-${day}/${name}`, data])), { level: 6 });
}
