/**
 * Basic text moderation for names and chat (13+ audience). A word list with light
 * leetspeak normalization; real moderation (reports reviewed server-side) comes with accounts.
 */
const BLOCKED = [
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'dick',
  'pussy',
  'asshole',
  'bastard',
  'slut',
  'whore',
  'nigger',
  'nigga',
  'faggot',
  'fag',
  'retard',
  'rape',
  'nazi',
  'hitler',
  'porn',
  'sex',
  'cock',
  'wank',
  'twat',
  'kys',
  'kill yourself',
];

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .split('')
    .map((c) => LEET[c] ?? c)
    .join('')
    .replace(/[^a-z ]/g, '');
}

export function containsBlocked(text: string): boolean {
  const n = normalize(text);
  const squashed = n.replace(/\s+/g, '');
  return BLOCKED.some((w) => n.includes(w) || squashed.includes(w.replace(/\s+/g, '')));
}

/** Replaces blocked words with asterisks, keeping the rest of the message. */
export function cleanText(text: string): string {
  return text
    .split(/(\s+)/)
    .map((word) => (containsBlocked(word) ? '*'.repeat(Math.max(3, word.length)) : word))
    .join('');
}

/** Returns an error message, or null if the name is allowed. */
export function validateName(name: string): string | null {
  const n = name.trim();
  if (n.length < 3) return 'At least 3 characters';
  if (n.length > 16) return 'At most 16 characters';
  if (!/^[A-Za-z0-9 _.-]+$/.test(n)) return 'Letters, numbers, spaces, _ . - only';
  if (containsBlocked(n)) return 'Please choose a different name';
  return null;
}
