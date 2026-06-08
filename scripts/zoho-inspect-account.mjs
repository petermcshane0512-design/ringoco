#!/usr/bin/env node
import dotenv from 'dotenv'
dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const ORG = process.env.ZOHO_ORG_ID

async function getAt() {
  const url = `https://accounts.zoho.com/oauth/v2/token?refresh_token=${process.env.ZOHO_REFRESH_TOKEN}&grant_type=refresh_token&client_id=${process.env.ZOHO_CLIENT_ID}&client_secret=${process.env.ZOHO_CLIENT_SECRET}`
  const r = await fetch(url, { method: 'POST' })
  const j = await r.json()
  return j.access_token
}

const at = await getAt()
const r = await fetch(
  `https://mail.zoho.com/api/organization/${ORG}/accounts?limit=50`,
  { headers: { Authorization: `Zoho-oauthtoken ${at}` } },
)
const j = await r.json()
const test = j.data.find(a =>
  a.primaryEmailAddress?.toLowerCase() === 'peter@bellavego-team.com',
)
console.log(JSON.stringify(test, null, 2))
