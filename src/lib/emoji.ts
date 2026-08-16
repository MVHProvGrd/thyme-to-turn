/**
 * Emoji for ingredient tiles — only where one is unambiguous. Everything else gets a
 * plain mono label. This is the whole list on purpose: 400 ingredients is an asset
 * pipeline, and lentils don't look different from split peas at 24px. Never generate
 * ingredient illustrations.
 *
 * Keyed by the registry's canonical name, which is singular (`egg`, not `eggs`).
 * Exact match only — `egg noodle` must not get an egg.
 */
const INGREDIENT_EMOJI: Record<string, string> = {
  chicken: '🍗',
  onion: '🧅',
  garlic: '🧄',
  lemon: '🍋',
  egg: '🥚',
  tomato: '🍅',
  bacon: '🥓',
  rice: '🍚',
  thyme: '🌿',
  potato: '🥔',
  chilli: '🌶',
  mushroom: '🍄',
  bread: '🍞',
  carrot: '🥕',
}

export function emojiFor(canonical: string): string | undefined {
  return INGREDIENT_EMOJI[canonical]
}
