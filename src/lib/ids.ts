/**
 * Identity. Decision D3: every record we own gets an ID we mint, at creation, and it never
 * changes. Outside identifiers (ISBN, Open Library keys) live in an `externalRefs` object
 * and are never a primary or foreign key.
 *
 * The coin tracker keyed its whole catalogue on Numista's N# and undoing it cost a planning
 * doc, a 15,619-row crosswalk, ~15 source files and a database migration that couldn't be
 * verified in CI. This file is the ten lines that buy us out of that.
 */

/** Mint a new record ID. Stable, opaque, ours. */
export function newId(): string {
  return crypto.randomUUID()
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** True for IDs this app minted. Used when validating an imported backup. */
export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}
