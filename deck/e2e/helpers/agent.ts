import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

// Which local stack and origin this run uses. Every agent has its own (scripts/agent-stack.mjs):
// DECK_AGENT=build (default) | kidux | parentux. `dev` is the parent's device-testing stack and
// is only used when asked for by name. The origin is always the Tailscale IP over plain http,
// never localhost, so tests run where the parent tests (no secure context).

function parse(file: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
}

function load(): Record<string, string> {
  const agent = process.env.DECK_AGENT ?? 'build';
  if (agent === 'dev') {
    const env = parse('.env.local');
    const host = new URL(env.VITE_SUPABASE_URL!).hostname;
    return {
      ...env,
      DECK_AGENT: 'dev',
      DECK_ORIGIN: `http://${host}:8894`,
      DECK_DB_CONTAINER: 'supabase_db_deck',
      DECK_MAILPIT: `http://${host}:54324`,
    };
  }
  const file = `.agents/${agent}/agent.env`;
  if (!existsSync(file)) throw new Error(`No ${file}. Run: node scripts/agent-stack.mjs up ${agent}`);
  return parse(file);
}

export const AGENT_ENV = load();
export const AGENT = AGENT_ENV.DECK_AGENT!;
export const ORIGIN = AGENT_ENV.DECK_ORIGIN!;
export const SUPABASE_URL = AGENT_ENV.VITE_SUPABASE_URL!;
export const ANON_KEY = AGENT_ENV.VITE_SUPABASE_ANON_KEY!;
export const DB_CONTAINER = AGENT_ENV.DECK_DB_CONTAINER!;
export const MAILPIT = `${AGENT_ENV.DECK_MAILPIT}/api/v1`;

/** Hosts a page may talk to: the app origin and its Supabase API (same Tailscale IP, other ports). */
export const OWN_HOSTS = [...new Set([new URL(ORIGIN).hostname, new URL(SUPABASE_URL).hostname])];

/** True when ORIGIN is not loopback: the run is on the Tailscale origin, as the plan requires. */
export function onTailscaleOrigin(): boolean {
  const host = new URL(ORIGIN).hostname;
  return host !== '127.0.0.1' && host !== 'localhost';
}

// Fail fast if the agent's database container isn't running, instead of timing out in a test.
export function assertStackUp() {
  execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', DB_CONTAINER], { encoding: 'utf8' });
}
