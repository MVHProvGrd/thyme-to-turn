import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * The import rules from the plan (02-ARCHITECTURE.md), enforced as a test rather than as
 * lint config — so they run with `npm test`, survive a change of linter, and can't quietly
 * drift from the docs.
 *
 * WordWeft's ROADMAP records why this matters: two hand-synced lists where "drift caused
 * the original installability bug." A rule nothing checks is a rule that decays.
 *
 * The payoff, concretely: `lib/` staying pure is what lets the pantry match — the feature
 * where a wrong answer is invisible — be tested without a browser or a device.
 */

const SRC = join(process.cwd(), 'src')

/** Layer → import sources it may NOT reach for. */
const FORBIDDEN: Record<string, { pattern: RegExp; why: string }[]> = {
  lib: [
    { pattern: /^react($|\/|-dom)/, why: 'lib/ must be pure — no React' },
    { pattern: /^dexie/, why: 'lib/ must not touch the database' },
    { pattern: /^\.\.\/(platform|api|db|screens|components)\//, why: 'lib/ imports only lib/' },
    { pattern: /^@\/(platform|api|db|screens|components)\//, why: 'lib/ imports only lib/' },
  ],
  platform: [
    { pattern: /^react($|\/|-dom)/, why: 'platform/ is the native seam — no React' },
    { pattern: /^dexie/, why: 'platform/ must not touch the database' },
    { pattern: /screens\//, why: 'platform/ must not know about screens' },
  ],
  db: [
    { pattern: /^react($|\/|-dom)/, why: 'db/ must not import React' },
    { pattern: /screens\//, why: 'db/ must not know about screens' },
    { pattern: /api\//, why: 'db/ must not make network calls' },
  ],
  api: [
    { pattern: /^react($|\/|-dom)/, why: 'api/ must not import React' },
    { pattern: /^dexie/, why: 'api/ must not write to the database — repo.ts is the only writer' },
    { pattern: /screens\//, why: 'api/ must not know about screens' },
  ],
  components: [
    { pattern: /(^|\/)(db|api|platform)\//, why: 'components/ are presentational — no data access' },
  ],
  seed: [
    { pattern: /^react($|\/|-dom)/, why: 'seed/ is data plus a loader — no React' },
    { pattern: /^dexie/, why: 'seed/ never writes — repo.ts is the only writer' },
    { pattern: /(^|\/)(db|api|platform|screens|components)\//, why: 'seed/ imports only lib/ types' },
  ],
}

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : []
  })
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const found: string[] = []
  const re = /(?:^|\n)\s*(?:import[\s\S]*?from|export[\s\S]*?from|import)\s*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) found.push(m[1])
  return found
}

describe('architecture: the import rules are real, not aspirational', () => {
  for (const [layer, rules] of Object.entries(FORBIDDEN)) {
    it(`src/${layer}/ respects its boundaries`, () => {
      const violations: string[] = []
      for (const file of sourceFiles(join(SRC, layer))) {
        for (const source of importsOf(file)) {
          for (const rule of rules) {
            if (rule.pattern.test(source)) {
              violations.push(`${relative(SRC, file)} imports "${source}" — ${rule.why}`)
            }
          }
        }
      }
      expect(violations).toEqual([])
    })
  }

  it('screens never reach past repo.ts into Dexie', () => {
    const violations: string[] = []
    for (const file of sourceFiles(join(SRC, 'screens'))) {
      for (const source of importsOf(file)) {
        if (/^dexie/.test(source) && !/dexie-react-hooks/.test(source)) {
          violations.push(`${relative(SRC, file)} imports "${source}" — go through db/repo.ts`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})
