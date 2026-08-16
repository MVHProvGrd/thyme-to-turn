import { describe, it, expect } from 'vitest'
import {
  BACKUP_FORMAT,
  BackupError,
  buildBackup,
  describeMerge,
  mergeByUuid,
  readBackup,
} from '../backup-format'

const settings = { key: 'singleton' as const, schemaVersion: 1, pantry: [] }

function backupJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    ...buildBackup({
      schemaVersion: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      recipes: [],
      books: [],
      ingredients: [],
      settings,
    }),
    ...overrides,
  })
}

describe('readBackup', () => {
  it('refuses a file from a newer schema instead of half-importing it', () => {
    const future = backupJson({
      manifest: {
        app: BACKUP_FORMAT,
        schemaVersion: 99,
        exportedAt: '2026-01-01T00:00:00.000Z',
        counts: { recipes: 0, books: 0, ingredients: 0, photos: 0 },
      },
    })
    expect(() => readBackup(future, 1)).toThrow(BackupError)
    expect(() => readBackup(future, 1)).toThrow(/newer version of the app/)
  })

  it('accepts an older schema — forward migrations are ours to run', () => {
    const old = backupJson({
      manifest: {
        app: BACKUP_FORMAT,
        schemaVersion: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        counts: { recipes: 0, books: 0, ingredients: 0, photos: 0 },
      },
    })
    expect(() => readBackup(old, 5)).not.toThrow()
  })

  it('says what is wrong rather than throwing something raw', () => {
    expect(() => readBackup('not json at all', 1)).toThrow(/isn't a Thyme to Turn backup/)
    expect(() => readBackup('{"hello":true}', 1)).toThrow(/isn't a Thyme to Turn backup/)
  })
})

describe('mergeByUuid — the upsert', () => {
  const a = { uuid: 'a', updatedAt: '2026-01-01T00:00:00.000Z', title: 'Ragu' }
  const b = { uuid: 'b', updatedAt: '2026-01-02T00:00:00.000Z', title: 'Soup' }

  it('adds rows that are new', () => {
    const { rows, report } = mergeByUuid([a], [b])
    expect(rows).toHaveLength(2)
    expect(report).toEqual({ added: 1, updated: 0, unchanged: 0 })
  })

  it('importing the same rows twice changes nothing — the bug this whole file exists for', () => {
    const first = mergeByUuid([], [a, b])
    const second = mergeByUuid(first.rows, [a, b])
    expect(second.rows).toHaveLength(2)
    expect(second.report).toEqual({ added: 0, updated: 0, unchanged: 2 })
  })

  it('keeps the newer row when the same uuid arrives twice', () => {
    const newer = { ...a, updatedAt: '2026-06-01T00:00:00.000Z', title: 'Ragu, fixed' }
    const { rows, report } = mergeByUuid([a], [newer])
    expect(rows[0].title).toBe('Ragu, fixed')
    expect(report.updated).toBe(1)
  })

  it('keeps what is on the device when the backup cannot prove it is newer', () => {
    const older = { ...a, updatedAt: '2020-01-01T00:00:00.000Z', title: 'Ragu, stale' }
    const { rows, report } = mergeByUuid([a], [older])
    expect(rows[0].title).toBe('Ragu')
    expect(report.unchanged).toBe(1)
  })

  it('skips rows with no uuid rather than minting one for them', () => {
    const { rows } = mergeByUuid([], [a, { uuid: '', title: 'junk' } as typeof a])
    expect(rows).toHaveLength(1)
  })
})

describe('describeMerge', () => {
  it('reports what happened in her words, not ours', () => {
    expect(describeMerge('recipes', { added: 3, updated: 0, unchanged: 39 })).toBe(
      '42 recipes: 3 new, 39 already present.',
    )
  })
})
