/** The single Dexie instance. Nothing else in the app constructs one. */

import { ThymeDb } from './schema'

export const db = new ThymeDb()
