'use client'

import { useState } from 'react'

type Lead = {
  email: string
  business: string
  city: string | null
  state: string | null
  trade: string | null
  owner_first_name: string | null
  owner_phone: string | null
  website_domain: string | null
  opens: number
  clicks: number
  replies: number
  step_id: string | null
  step_label: string | null
  last_contact_at: string | null
  last_open_at: string | null
  last_click_at: string | null
  staged_email: string | null
  staged_at: string | null
  staged_open_count: number | null
  outreach_id: string | null
  pushed_at: string | null
  call_attempted_at: string | null
  call_outcome: string | null
  notes: string | null
  hotness: number
}

function relTime(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'just now'
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  return `${d}d ago`
}

export default function HandRaiseCard({ lead, called }: { lead: Lead; called?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState<'subject' | 'body' | 'all' | null>(null)
  const [marking, setMarking] = useState(false)
  const [marked, setMarked] = useState(false)

  const stagedSubject = lead.staged_email?.match(/^Subject: (.+?)$/m)?.[1] || ''
  const stagedBody = lead.staged_email?.replace(/^Subject: .+?\n\n/, '')?.replace(/\n\n\[signal:[\s\S]*?\]/, '') || ''

  const copy = async (what: 'subject' | 'body' | 'all') => {
    let text = ''
    if (what === 'subject') text = stagedSubject
    else if (what === 'body') text = stagedBody
    else text = `Subject: ${stagedSubject}\n\nTo: ${lead.email}\n\n${stagedBody}`
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1800) } catch { /* */ }
  }

  const gmailLink = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(lead.email)}&su=${encodeURIComponent(stagedSubject)}&body=${encodeURIComponent(stagedBody)}`
  const websiteLink = lead.website_domain ? `https://${lead.website_domain.replace(/^https?:\/\//, '')}` : null
  const googleLink = `https://www.google.com/search?q=${encodeURIComponent(lead.business + ' ' + (lead.city || '') + ' phone number')}`

  const markCalled = async (outcome: 'answered' | 'voicemail' | 'no_answer' | 'not_interested' | 'demo_booked') => {
    if (!lead.outreach_id) return
    setMarking(true)
    try {
      await fetch('/api/admin/hand-raises/mark-called', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outreach_id: lead.outreach_id, outcome }),
      })
      setMarked(true)
    } catch { /* */ }
    setMarking(false)
  }

  if (marked) {
    return (
      <div style={{ padding: 14, borderRadius: 12, background: 'rgba(94,234,212,0.10)', border: '1px solid rgba(94,234,212,0.30)', color: '#5EEAD4', fontSize: 13, textAlign: 'center' }}>
        ✓ Marked called — {lead.business}
      </div>
    )
  }

  return (
    <div style={{
      padding: 16, borderRadius: 14,
      background: called ? 'rgba(15,37,66,0.40)' : 'rgba(15,37,66,0.65)',
      border: `1px solid ${called ? 'rgba(94,234,212,0.18)' : (lead.clicks > 0 ? 'rgba(232,116,43,0.40)' : 'rgba(94,234,212,0.25)')}`,
      opacity: called ? 0.7 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            {lead.clicks > 0 && (
              <span style={{ padding: '2px 8px', borderRadius: 99, background: '#E8742B', color: '#0B1F3A', fontSize: 10, fontWeight: 900, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                🔥 {lead.clicks} click{lead.clicks > 1 ? 's' : ''}
              </span>
            )}
            <span style={{ padding: '2px 8px', borderRadius: 99, background: 'rgba(94,234,212,0.15)', color: '#5EEAD4', fontSize: 11, fontWeight: 800 }}>
              {lead.opens} opens
            </span>
            {lead.trade && (
              <span style={{ padding: '2px 8px', borderRadius: 99, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 700 }}>
                {lead.trade}
              </span>
            )}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{lead.business}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 3 }}>
            {lead.email}
            {lead.city && ` · ${lead.city}${lead.state ? ', ' + lead.state : ''}`}
            {lead.owner_first_name && ` · owner: ${lead.owner_first_name}`}
          </div>
          {/* Activity timeline */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.50)' }}>
            {lead.step_label && (
              <span>📧 <strong style={{ color: 'rgba(255,255,255,0.75)' }}>{lead.step_label}</strong></span>
            )}
            {lead.last_contact_at && (
              <span>last sent <strong style={{ color: 'rgba(255,255,255,0.75)' }}>{relTime(lead.last_contact_at)}</strong></span>
            )}
            {lead.last_open_at && (
              <span>👀 last opened <strong style={{ color: '#5EEAD4' }}>{relTime(lead.last_open_at)}</strong></span>
            )}
            {lead.last_click_at && (
              <span>🔥 last click <strong style={{ color: '#FF9D5A' }}>{relTime(lead.last_click_at)}</strong></span>
            )}
            {lead.pushed_at && !lead.last_open_at && (
              <span>queued <strong style={{ color: 'rgba(255,255,255,0.75)' }}>{relTime(lead.pushed_at)}</strong></span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {lead.owner_phone && (
            <a href={`tel:${lead.owner_phone}`} style={btn('tel')}>📞 Call {lead.owner_phone}</a>
          )}
          {!lead.owner_phone && (
            <a href={googleLink} target="_blank" rel="noreferrer" style={btn('search')}>🔎 Find phone</a>
          )}
          {websiteLink && <a href={websiteLink} target="_blank" rel="noreferrer" style={btn('ghost')}>🌐 Site</a>}
        </div>
      </div>

      {lead.notes && (
        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
          📝 {lead.notes}
        </div>
      )}

      {lead.staged_email && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setExpanded(!expanded)} style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            background: 'rgba(94,234,212,0.10)',
            border: '1px solid rgba(94,234,212,0.25)',
            color: '#5EEAD4', fontSize: 12, fontWeight: 800, cursor: 'pointer', textAlign: 'left',
          }}>
            {expanded ? '▼' : '▶'} Staged Sonnet email ({stagedSubject.length} chars subject)
          </button>
          {expanded && (
            <div style={{ marginTop: 8, padding: 14, borderRadius: 8, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Subject</div>
              <div style={{ fontSize: 13, color: '#FFD9A8', fontFamily: "'JetBrains Mono', ui-monospace, monospace", marginBottom: 12 }}>{stagedSubject}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Body</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', whiteSpace: 'pre-wrap', lineHeight: 1.55, marginBottom: 12 }}>{stagedBody}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => copy('subject')} style={btn('copy')}>{copied === 'subject' ? '✓ Copied' : 'Copy subject'}</button>
                <button onClick={() => copy('body')} style={btn('copy')}>{copied === 'body' ? '✓ Copied' : 'Copy body'}</button>
                <button onClick={() => copy('all')} style={btn('copy')}>{copied === 'all' ? '✓ Copied' : 'Copy all'}</button>
                <a href={gmailLink} target="_blank" rel="noreferrer" style={btn('cta')}>✉ Open in Gmail</a>
              </div>
            </div>
          )}
        </div>
      )}

      {!called && (
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.12)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Mark called</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['answered','voicemail','no_answer','not_interested','demo_booked'] as const).map((o) => (
              <button key={o} disabled={marking} onClick={() => markCalled(o)} style={{
                padding: '5px 9px', borderRadius: 6,
                background: o === 'demo_booked' ? 'rgba(94,234,212,0.20)' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${o === 'demo_booked' ? 'rgba(94,234,212,0.40)' : 'rgba(255,255,255,0.15)'}`,
                color: o === 'demo_booked' ? '#5EEAD4' : 'rgba(255,255,255,0.75)',
                fontSize: 11, fontWeight: 700, cursor: marking ? 'wait' : 'pointer',
              }}>{o.replace(/_/g, ' ')}</button>
            ))}
          </div>
        </div>
      )}

      {called && lead.call_outcome && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
          ✓ {lead.call_outcome.replace(/_/g, ' ')} {lead.call_attempted_at && `· ${new Date(lead.call_attempted_at).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
        </div>
      )}
    </div>
  )
}

function btn(kind: 'tel' | 'search' | 'ghost' | 'copy' | 'cta'): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', borderRadius: 8,
    fontSize: 12, fontWeight: 800, textDecoration: 'none',
    cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.05)', color: '#fff',
  }
  if (kind === 'tel') return { ...base, background: '#5EEAD4', color: '#0B1F3A', border: 'none' }
  if (kind === 'search') return { ...base, background: 'rgba(94,234,212,0.15)', color: '#5EEAD4', border: '1px solid rgba(94,234,212,0.30)' }
  if (kind === 'cta') return { ...base, background: '#FF9D5A', color: '#0B1F3A', border: 'none' }
  if (kind === 'copy') return { ...base, background: 'rgba(255,255,255,0.10)' }
  return base
}
