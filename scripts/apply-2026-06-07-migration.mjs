#!/usr/bin/env node
/**
 * One-shot SQL migration runner — applies the
 * sql/2026-06-07-creator-nudge-cols.sql migration to prod Supabase.
 * Idempotent (IF NOT EXISTS). Safe to re-run.
 *
 * Uses the Supabase REST `rpc` or raw SQL via service-role connection.
 * Since Supabase JS doesn't expose raw DDL, we issue each ALTER as a
 * separate request via the PostgREST `_/sql` endpoint not available;
 * fall back to issuing the statements as RPC if a stored function
 * `exec_sql` exists, else print instructions for SQL editor.
 *
 * Cleanest path: just probe whether the columns exist by SELECTing them.
 * If they do → migration already applied. If not → print the SQL block
 * for Peter to paste.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(here, '..', '.env.local')

try {
  const env = readFileSync(envPath, 'utf8')
  env.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  })
} catch (e) {
  console.error('env read failed:', e.message); process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

async function probeColumn(table, column) {
  const { error } = await supabase.from(table).select(column).limit(1)
  return !error  // no error = column exists
}

const checks = [
  { table: 'ig_creator_outreach', col: 'nudge_count' },
  { table: 'ig_creator_outreach', col: 'last_nudge_at' },
  { table: 'profiles',            col: 'reactivation_attempted_at' },
  { table: 'profiles',            col: 'reactivation_count' },
]

const present = []
const missing = []
for (const c of checks) {
  const ok = await probeColumn(c.table, c.col)
  if (ok) present.push(c)
  else missing.push(c)
}

console.log('\n=== Migration status: sql/2026-06-07-creator-nudge-cols.sql ===\n')
for (const c of present) console.log(`  ✓ ${c.table}.${c.col} EXISTS`)
for (const c of missing) console.log(`  ✗ ${c.table}.${c.col} MISSING`)

if (missing.length === 0) {
  console.log('\n✓ Migration already applied. Nothing to do.\n')
  process.exit(0)
}

console.log('\n⚠ Some columns missing. Paste this in Supabase SQL Editor:\n')
console.log('━'.repeat(70))
console.log(`ALTER TABLE ig_creator_outreach
  ADD COLUMN IF NOT EXISTS nudge_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_nudge_at  TIMESTAMPTZ;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS reactivation_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reactivation_count        INTEGER NOT NULL DEFAULT 0;`)
console.log('━'.repeat(70))
console.log('\nThen re-run this script to confirm all 4 columns now exist.\n')
process.exit(1)
