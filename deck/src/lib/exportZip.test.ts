import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildExportZip, toCsv, type FamilyExport } from './exportZip';

describe('toCsv', () => {
  it('quotes commas, quotes and newlines, and defuses spreadsheet formulas', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['line\nbreak', '=1+1']])).toBe('a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak","=1+1"\r\n');
  });
});

describe('buildExportZip', () => {
  it('contains the full JSON and the readable CSVs', () => {
    const ex: FamilyExport = {
      format: 'the-deck-family-export',
      version: 1,
      exported_at: '2026-10-01T12:00:00Z',
      family: { name: 'Family A', timezone: 'UTC' },
      tables: {
        kids: [{ id: 'k1', nickname: 'Kid A', age_band: 'reader' }],
        events: [{ on_date: '2026-10-13', title: 'Beach trip', kind: 'trip', visible_to_kids: true }],
        routines: [{ id: 'r1', name: 'Dawn Patrol', slot: 'morning', starts_at: '06:30:00', kid_id: null, steps: [{ id: 'teeth', text: 'Brush teeth', icon: 'toothbrush' }] }],
        routine_completions: [{ routine_id: 'r1', kid_id: 'k1', on_date: '2026-10-01', completed_steps: ['teeth'], completed_at: null }],
      },
      module_catalog: [],
      omitted: { 'kids.pin_hash': 'secret' },
    };
    const files = unzipSync(buildExportZip(ex));
    const names = Object.keys(files).map((n) => n.split('/')[1]);
    expect(names.sort()).toEqual(['README.txt', 'events.csv', 'export.json', 'kids.csv', 'routine_progress.csv', 'routines.csv', 'usage.csv']);
    expect(JSON.parse(strFromU8(files['the-deck-export-2026-10-01/export.json']!))).toEqual(ex);
    expect(strFromU8(files['the-deck-export-2026-10-01/routine_progress.csv']!)).toContain('2026-10-01,Kid A,Dawn Patrol,1,1,');
  });
});
