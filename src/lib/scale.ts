/**
 * Scaling a recipe, and showing its amounts in the units she thinks in. PURE.
 *
 * Both are DISPLAY ONLY. `raw` is never rewritten and neither is the stored
 * quantity — "1½ cups (190 g) flour, sifted" stays exactly that on disk forever, and
 * doubling a recipe or asking for metric changes what the screen renders, nothing else.
 * That is the same rule that lets the normalizer improve without a re-parse.
 *
 * The honest limit on conversion: volume and weight are NOT interchangeable without
 * knowing density. A cup of flour and a cup of water weigh different amounts, so this
 * converts volume→volume and weight→weight and refuses to guess across the two. Half a
 * conversion is better than a confident wrong one — the same principle as the rest of
 * the app.
 */

export type UnitPreference = 'as-written' | 'metric' | 'imperial'

/** Common scalings. A cook halves, doubles or triples; she does not scale by 1.37. */
export const SCALE_STEPS = [0.5, 1, 2, 3] as const

export function scaleAmount(quantity: number | undefined, factor: number): number | undefined {
  if (quantity === undefined || !Number.isFinite(quantity)) return undefined
  return quantity * factor
}

/* ------------------------------------------------------------------ fractions */

const FRACTIONS: [number, string][] = [
  [0.125, '⅛'],
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.375, '⅜'],
  [0.5, '½'],
  [0.625, '⅝'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
  [0.875, '⅞'],
]

/**
 * "1½", "⅔", "350". A cook reads fractions, not 0.6666666666666666 — and rounding to two
 * decimals would turn a third of a cup into 0.33, which is not a thing anyone measures.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return ''
  const rounded = Math.round(value * 1000) / 1000
  // Fractions are for amounts a cook measures in them: 1 1/2 cups, 2 3/4 tsp. Above ten
  // they stop being useful and start being wrong — 237 1/2 ml is not a thing anyone pours,
  // and a half of a millilitre is noise rather than precision.
  if (Math.abs(rounded) >= 10) return String(Math.round(rounded))
  if (Number.isInteger(rounded)) return String(rounded)
  const whole = Math.floor(rounded)
  const rest = rounded - whole
  const match = FRACTIONS.find(([size]) => Math.abs(rest - size) < 0.02)
  if (match) return `${whole || ''}${match[1]}`
  return String(Math.round(rounded * 100) / 100)
}

/* ---------------------------------------------------------------- conversion */

/** ml per unit. Deliberately the US customary cup — it is what her books mostly print. */
const AS_ML: Record<string, number> = {
  tsp: 4.93,
  tbsp: 14.79,
  cup: 236.6,
  pint: 473.2,
  quart: 946.4,
  ml: 1,
  l: 1000,
}

/** grams per unit. */
const AS_GRAMS: Record<string, number> = {
  oz: 28.35,
  lb: 453.6,
  g: 1,
  kg: 1000,
}

const METRIC_UNITS = new Set(['ml', 'l', 'g', 'kg'])

export function isVolume(unit: string): boolean {
  return unit in AS_ML
}

export function isWeight(unit: string): boolean {
  return unit in AS_GRAMS
}

/**
 * The amount in her preferred system, or exactly what was written when it cannot be
 * converted honestly — an unknown unit ("bulb", "clove", "pinch"), or a request to cross
 * between volume and weight.
 */
export function convertAmount(
  quantity: number,
  unit: string,
  preference: UnitPreference,
): { quantity: number; unit: string } {
  if (preference === 'as-written') return { quantity, unit }

  if (isVolume(unit)) {
    const ml = quantity * AS_ML[unit]
    if (preference === 'metric') {
      if (METRIC_UNITS.has(unit)) return { quantity, unit }
      return ml >= 1000 ? { quantity: ml / 1000, unit: 'l' } : { quantity: ml, unit: 'ml' }
    }
    if (METRIC_UNITS.has(unit)) {
      if (ml >= AS_ML.cup) return { quantity: ml / AS_ML.cup, unit: 'cup' }
      if (ml >= AS_ML.tbsp) return { quantity: ml / AS_ML.tbsp, unit: 'tbsp' }
      return { quantity: ml / AS_ML.tsp, unit: 'tsp' }
    }
    return { quantity, unit }
  }

  if (isWeight(unit)) {
    const grams = quantity * AS_GRAMS[unit]
    if (preference === 'metric') {
      if (METRIC_UNITS.has(unit)) return { quantity, unit }
      return grams >= 1000 ? { quantity: grams / 1000, unit: 'kg' } : { quantity: grams, unit: 'g' }
    }
    if (METRIC_UNITS.has(unit)) {
      return grams >= AS_GRAMS.lb
        ? { quantity: grams / AS_GRAMS.lb, unit: 'lb' }
        : { quantity: grams / AS_GRAMS.oz, unit: 'oz' }
    }
    return { quantity, unit }
  }

  // "2 bulbs fennel" converts to nothing at all, and that is the right answer.
  return { quantity, unit }
}

/**
 * "1½ cups" for the 88px column. Scales, converts, then formats — in that order, so
 * doubling half a cup gives one cup rather than two halves.
 */
export function displayAmount(
  quantity: number | undefined,
  unit: string | undefined,
  options: { factor?: number; preference?: UnitPreference; formatUnit: (unit: string | undefined, quantity: number | undefined) => string },
): string {
  const factor = options.factor ?? 1
  const preference = options.preference ?? 'as-written'
  const scaled = scaleAmount(quantity, factor)

  if (scaled === undefined) return unit ? options.formatUnit(unit, undefined) : ''

  const converted = unit ? convertAmount(scaled, unit, preference) : { quantity: scaled, unit: '' }
  return [formatNumber(converted.quantity), options.formatUnit(converted.unit || undefined, converted.quantity)]
    .filter(Boolean)
    .join(' ')
}

/**
 * "Serves 4" doubled is "Serves 8". Only the first number moves, and only when there is
 * one — the rest of her yield line is her words and stays put.
 */
export function scaleYield(text: string | undefined, factor: number): string | undefined {
  if (!text) return text
  if (factor === 1) return text
  return text.replace(/\d+(?:\.\d+)?/, (match) => formatNumber(Number(match) * factor))
}
