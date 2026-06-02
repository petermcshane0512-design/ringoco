#!/usr/bin/env node
import pg from 'pg'
import fs from 'node:fs'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
console.log('🟢 Connected')
await c.query(fs.readFileSync('C:\\Users\\peter\\ringoco\\sql\\2026-06-01-seo-shop-cache.sql', 'utf8'))
console.log('  ✅ seo_shop_cache table applied')
const { rows } = await c.query("SELECT 1 FROM information_schema.tables WHERE table_name='seo_shop_cache'")
console.log(rows.length > 0 ? '  ✅ table exists' : '  ❌ table missing')
await c.end()
