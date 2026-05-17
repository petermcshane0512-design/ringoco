import crypto from 'crypto'

/**
 * AES-256-GCM symmetric encryption for OAuth tokens at rest.
 *
 * Even though Supabase encrypts the database at rest, we add app-layer
 * encryption so a leaked service-role key alone doesn't surrender every
 * customer's calendar tokens — the attacker would also need
 * CALENDAR_TOKEN_ENCRYPTION_KEY.
 *
 * Storage format: hex(iv).hex(authTag).hex(ciphertext)
 *   - iv:        12 random bytes per encryption (GCM standard)
 *   - authTag:   16 bytes (GCM standard)
 *   - ciphertext: variable length, hex-encoded
 *
 * Key rotation: set CALENDAR_TOKEN_ENCRYPTION_KEY_NEW, deploy, run a one-off
 * re-encrypt script (reads with old key, writes with new), then swap names
 * and remove the OLD env var. Tokens encrypted with a missing key fail
 * decrypt cleanly — customer just needs to re-connect.
 *
 * Env var:
 *   CALENDAR_TOKEN_ENCRYPTION_KEY=<64-char hex string = 32 bytes>
 *
 * Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

const ALGO = 'aes-256-gcm'
const IV_LEN = 12   // GCM standard
const TAG_LEN = 16  // GCM standard

function getKey(): Buffer {
  const hex = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error(
      'CALENDAR_TOKEN_ENCRYPTION_KEY must be set to a 64-char hex string (32 bytes). ' +
      'Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    )
  }
  return Buffer.from(hex, 'hex')
}

export function encryptToken(plaintext: string): string {
  if (!plaintext) return ''
  const key = getKey()
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}.${tag.toString('hex')}.${enc.toString('hex')}`
}

export function decryptToken(payload: string): string {
  if (!payload) return ''
  const parts = payload.split('.')
  if (parts.length !== 3) throw new Error('Invalid encrypted token format')
  const key = getKey()
  const iv = Buffer.from(parts[0], 'hex')
  const tag = Buffer.from(parts[1], 'hex')
  const data = Buffer.from(parts[2], 'hex')
  if (iv.length !== IV_LEN) throw new Error('Invalid IV length')
  if (tag.length !== TAG_LEN) throw new Error('Invalid auth tag length')
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(data) + decipher.final('utf8')
}

/** Safely decrypt — returns null instead of throwing. Used in cron contexts
 *  where one bad row shouldn't abort the whole loop. */
export function tryDecryptToken(payload: string | null | undefined): string | null {
  if (!payload) return null
  try { return decryptToken(payload) } catch { return null }
}
