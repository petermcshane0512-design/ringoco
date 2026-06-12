// Pull a few campaign contacts and dump their full payload to confirm
// free_lead_url + city + trade actually landed. Uses the deployed admin
// route is not possible (no inspect-by-email), so hit Instantly directly.
// INSTANTLY key is sealed locally -> run via the bellavego proxy admin
// route instead. Fallback: print instructions.
const SECRET = 'b7f4e9a1c25d8036f1e7b2a94c0d63e8f5a21b9d4e7c0a6f'
const r = await fetch('https://www.bellavego.com/api/admin/instantly-contact-debug', {
  headers: { 'x-admin-secret': SECRET },
}).catch(() => null)
if (r && r.ok) { console.log(await r.text()) }
else { console.log('debug route not deployed yet (status ' + (r ? r.status : 'no-conn') + ')') }
