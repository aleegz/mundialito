export type RandomIdentity = {
  name: string;
  avatar: string;
};

const ADJECTIVES = [
  "Curioso",
  "Veloz",
  "Picante",
  "Aventurero",
  "Brillante",
  "Inquieto",
  "Valiente",
  "Jugueton",
] as const;

const NOUNS = [
  "Zorro",
  "Mate",
  "Cometa",
  "Tiburon",
  "Gato",
  "Rayo",
  "Bicho",
  "Robot",
] as const;

const AVATARS = ["🦊", "🐙", "🦄", "🐸", "🐯", "🚀", "🍕", "🎲"] as const;

function indexFrom(value: number, length: number): number {
  return Math.min(length - 1, Math.max(0, Math.floor(value * length)));
}

export function randomIdentity(random = Math.random): RandomIdentity {
  const adjective = ADJECTIVES[indexFrom(random(), ADJECTIVES.length)];
  const noun = NOUNS[indexFrom(random(), NOUNS.length)];
  const avatar = AVATARS[indexFrom(random(), AVATARS.length)];

  return { name: `${adjective} ${noun}`, avatar };
}

export function suggestedIdentity(seed: string): RandomIdentity {
  let hash = 2166136261;

  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  const normalized = (hash >>> 0) / 4294967296;
  const adjective = ADJECTIVES[indexFrom(normalized, ADJECTIVES.length)];
  const noun = NOUNS[indexFrom((normalized * 13) % 1, NOUNS.length)];
  const avatar = AVATARS[indexFrom((normalized * 29) % 1, AVATARS.length)];

  return { name: `${adjective} ${noun}`, avatar };
}

export function avatarForName(name: string): string {
  return suggestedIdentity(name.trim().toLowerCase()).avatar;
}
