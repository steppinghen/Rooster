import { execFileSync } from 'node:child_process';

/** Run SQL as postgres on the LOCAL stack only (test setup). Returns rows as tab-separated lines. */
export function sql(query: string): string[] {
  const out = execFileSync('docker', ['exec', '-i', 'supabase_db_deck', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA', '-F', '\t'], {
    input: query,
    encoding: 'utf8',
  });
  return out.split('\n').filter(Boolean);
}

export const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** A unique placeholder email per test run, e.g. parent-a-1696154400123@example.test */
export function testEmail(who: string): string {
  return `${who}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.test`;
}

/** Let `email` create a family (what the parent does by hand at Gate 2). */
export function allowBootstrap(email: string) {
  sql(`insert into public.parent_allowlist (email, family_id) values (${lit(email)}, null) on conflict do nothing;`);
}
