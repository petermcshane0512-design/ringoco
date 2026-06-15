/**
 * classifyReply — read a cold-email reply and decide if it's a REAL lead.
 * (2026-06-15, built after the call board sent Peter at two rejections —
 * Alvizo "not interested" + Aire Serv "yes please, hope this is your last
 * note" — both were scored as hot replies. The board must only surface
 * genuine interest, and STOP replies must halt sending for compliance.)
 *
 * Precedence matters: a message like "yes please, I hope this is your last
 * note!" contains both a "yes" and a stop signal — STOP wins. Order:
 *   auto  →  stop  →  not_interested  →  interested  →  neutral
 */

export type ReplySentiment = 'interested' | 'not_interested' | 'stop' | 'auto' | 'neutral'

const AUTO = /\b(out of office|auto[\s-]?reply|automatic reply|away from (my|the) (desk|office)|on vacation|on holiday|maternity|i am currently|currently out|mailer[\s-]?daemon|undeliverable|delivery (has )?failed|delivery status notification|address not found|we found some articles|thanks for (contacting|reaching)|your (ticket|request) has been|case number)\b/i

const STOP = /\b(unsubscribe|opt[\s-]?out|remove me|take me off|take us off|do not (contact|email|reply|send)|don'?t (contact|email|message) me|stop (emailing|contacting|sending|messaging)|leave me alone|quit emailing|last (note|email|time)|never (email|contact)|lose my (email|number)|f\*?u?c?k off)\b/i

const NOT_INTERESTED = /\b(not interested|no thank|no thanks|not at this time|we'?re (all )?(good|set)|already (have|use|using|got)|we have (a|our)|no need|no thanks|pass on this|we'?re covered|not (for us|looking|right now)|happy with (our|my)|already covered)\b/i

const INTERESTED = /\b(interested|tell me more|how much|what.?s (the|your) (price|cost|pricing)|pricing|sign me up|sign up|let'?s (do it|talk|chat|go|set)|sounds (good|great|interesting)|i'?m in|count me in|call me|give me a call|send (it|them|me|over|the)|yes please send|more info|more information|want to (try|see|learn)|set (up|me up)|schedule|when can|how does (it|this) work|let me know more)\b/i

export function classifyReply(text: string | null | undefined): ReplySentiment {
  const t = (text || '').toLowerCase().replace(/\s+/g, ' ').trim()
  if (!t) return 'neutral'
  if (AUTO.test(t)) return 'auto'
  if (STOP.test(t)) return 'stop'           // compliance — must halt sending
  if (NOT_INTERESTED.test(t)) return 'not_interested'
  if (INTERESTED.test(t)) return 'interested'
  // bare "yes"/"sure"/"ok" with nothing negative = lean interested
  if (/^(yes|yep|sure|ok(ay)?|interested|👍)\b/.test(t)) return 'interested'
  return 'neutral'
}

/** A reply that should STILL surface as a callable hot lead. */
export function isHotReply(s: ReplySentiment): boolean {
  return s === 'interested' || s === 'neutral'
}

/** A reply that must stop further sending to that address. */
export function isOptOut(s: ReplySentiment): boolean {
  return s === 'stop' || s === 'not_interested'
}
