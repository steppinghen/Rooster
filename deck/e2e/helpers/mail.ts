// Reads email sign-in codes from the local Supabase mail viewer (Mailpit). Local only.
import { MAILPIT } from './agent';

type Summary = { ID: string; Created: string; To: { Address: string }[] };

export async function latestCode(email: string, since: number, timeoutMs = 15_000): Promise<{ code: string; text: string; html: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const body = (await res.json()) as { messages: Summary[] };
    const fresh = body.messages.filter((m) => new Date(m.Created).getTime() >= since - 1000);
    if (fresh.length) {
      const msg = (await (await fetch(`${MAILPIT}/message/${fresh[0]!.ID}`)).json()) as { Text: string; HTML: string };
      const match = /\b(\d{6})\b/.exec(msg.Text || msg.HTML);
      if (match) return { code: match[1]!, text: msg.Text, html: msg.HTML };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`no sign-in code for ${email}`);
}
