'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type Quote = {
  id: string
  customer_name?: string
  customer_phone: string
  customer_email?: string
  quote_amount?: number
  quote_description?: string
  status: string
  followup_count: number
  next_followup_at?: string
  created_at: string
}

type Invoice = {
  id: string
  customer_name?: string
  customer_phone: string
  customer_email?: string
  invoice_amount: number
  invoice_description?: string
  due_date?: string
  status: string
  chase_count: number
  next_chase_at?: string
  stripe_payment_link?: string
  created_at: string
}

type Review = {
  id: string
  review_author?: string
  review_rating?: number
  review_text?: string
  drafted_reply: string
  status: string
  created_at: string
}

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid rgba(10,168,159,0.14)',
  borderRadius: 14,
  overflow: 'hidden',
  boxShadow: '0 2px 16px rgba(7,27,58,0.06)',
  marginBottom: 18,
}
const cardHead: React.CSSProperties = {
  padding: '14px 20px',
  borderBottom: '1px solid rgba(10,168,159,0.1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}
const cardBody: React.CSSProperties = { padding: 20 }
const input: React.CSSProperties = {
  width: '100%',
  background: '#F5FDFB',
  border: '1.5px solid rgba(10,168,159,0.2)',
  borderRadius: 8,
  padding: '9px 12px',
  fontSize: 13,
  color: '#0B1F3A',
  fontFamily: 'system-ui, sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
}
const label: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#7AAAB2',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 5,
  display: 'block',
}

export default function OfficeManagerPage() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tablesMissing, setTablesMissing] = useState(false)

  // Quote form
  const [qName, setQName] = useState('')
  const [qPhone, setQPhone] = useState('')
  const [qAmount, setQAmount] = useState('')
  const [qDesc, setQDesc] = useState('')
  const [qSubmitting, setQSubmitting] = useState(false)
  const [qMsg, setQMsg] = useState<string | null>(null)

  // Invoice form
  const [iName, setIName] = useState('')
  const [iPhone, setIPhone] = useState('')
  const [iAmount, setIAmount] = useState('')
  const [iDesc, setIDesc] = useState('')
  const [iDue, setIDue] = useState('')
  const [iLink, setILink] = useState('')
  const [iSubmitting, setISubmitting] = useState(false)
  const [iMsg, setIMsg] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/office-manager/list')
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error || `HTTP ${res.status}`)
      setLoading(false)
      return
    }
    const j = await res.json()
    setQuotes(j.quotes ?? [])
    setInvoices(j.invoices ?? [])
    setReviews(j.reviews ?? [])
    setTablesMissing(!!j.tablesMissing)
    setLoading(false)
  }

  async function addQuote(e: React.FormEvent) {
    e.preventDefault()
    setQSubmitting(true)
    setQMsg(null)
    const res = await fetch('/api/quotes/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: qName,
        customerPhone: qPhone,
        quoteAmount: qAmount ? Number(qAmount) : undefined,
        quoteDescription: qDesc,
      }),
    })
    setQSubmitting(false)
    const j = await res.json().catch(() => ({}))
    if (res.ok) {
      setQMsg('Quote tracked. First SMS follow-up scheduled in 48 hours.')
      setQName(''); setQPhone(''); setQAmount(''); setQDesc('')
      load()
    } else {
      setQMsg(`Failed: ${j.error || res.statusText}`)
    }
  }

  async function addInvoice(e: React.FormEvent) {
    e.preventDefault()
    setISubmitting(true)
    setIMsg(null)
    const res = await fetch('/api/invoices/add-past-due', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: iName,
        customerPhone: iPhone,
        invoiceAmount: Number(iAmount),
        invoiceDescription: iDesc,
        dueDate: iDue || undefined,
        stripePaymentLink: iLink || undefined,
      }),
    })
    setISubmitting(false)
    const j = await res.json().catch(() => ({}))
    if (res.ok) {
      setIMsg('Invoice tracked. First chase SMS scheduled in 48 hours.')
      setIName(''); setIPhone(''); setIAmount(''); setIDesc(''); setIDue(''); setILink('')
      load()
    } else {
      setIMsg(`Failed: ${j.error || res.statusText}`)
    }
  }

  if (loading) return <div style={{ padding: 40, fontFamily: 'system-ui' }}>Loading…</div>
  if (error) return (
    <div style={{ padding: 40, fontFamily: 'system-ui', color: '#DC2626' }}>
      <h2>Office Manager unavailable</h2>
      <p>{error}</p>
      <p style={{ fontSize: 13, color: '#4A7A80' }}>This feature requires the Office Manager tier ($797/mo) or Concierge ($1,997/mo).</p>
      <Link href="/dashboard">← Back to dashboard</Link>
    </div>
  )

  return (
    <div style={{ padding: '28px 32px 60px', fontFamily: "'Inter', system-ui, sans-serif", color: '#0B1F3A' }}>

      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
          AI Office Manager
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em', marginBottom: 4 }}>Quote Hunter & Collections</h1>
        <p style={{ fontSize: 13, color: '#4A7A80' }}>Track quotes and past-due invoices. The AI follows up on autopilot — you sign off when revenue clears.</p>
      </div>

      {tablesMissing && (
        <div style={{ marginBottom: 18, padding: '14px 18px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, color: '#92400E', fontSize: 13 }}>
          <strong>Office Manager tables not installed yet.</strong> Run <code>supabase-migrations/008_office_manager.sql</code> in the Supabase SQL editor.
          Until then, adding quotes/invoices below will fail.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>

        {/* Quote Hunter */}
        <div>
          <div style={card}>
            <div style={cardHead}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Add a quote</div>
                <div style={{ fontSize: 11, color: '#7AAAB2', marginTop: 2 }}>SMS follow-ups at day 2, 7, 14 until they say yes or no.</div>
              </div>
            </div>
            <div style={cardBody}>
              <form onSubmit={addQuote}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <span style={label}>Customer name</span>
                    <input style={input} value={qName} onChange={e => setQName(e.target.value)} placeholder="Jane Smith" />
                  </div>
                  <div>
                    <span style={label}>Phone *</span>
                    <input style={input} value={qPhone} onChange={e => setQPhone(e.target.value)} placeholder="+17735551234" required />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <span style={label}>Quote amount ($)</span>
                  <input style={input} type="number" step="0.01" value={qAmount} onChange={e => setQAmount(e.target.value)} placeholder="2400" />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <span style={label}>What was quoted</span>
                  <input style={input} value={qDesc} onChange={e => setQDesc(e.target.value)} placeholder="New 3-ton AC install" />
                </div>
                <button
                  type="submit"
                  disabled={qSubmitting || !qPhone}
                  style={{
                    padding: '10px 22px',
                    borderRadius: 9,
                    border: 'none',
                    background: 'linear-gradient(135deg,#0AA89F,#0D8F87)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: qSubmitting || !qPhone ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {qSubmitting ? 'Adding…' : 'Track this quote'}
                </button>
                {qMsg && <div style={{ marginTop: 10, fontSize: 12, color: qMsg.startsWith('Failed') ? '#DC2626' : '#15803D' }}>{qMsg}</div>}
              </form>
            </div>
          </div>

          {/* Quote list */}
          <div style={card}>
            <div style={cardHead}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Active quotes ({quotes.filter(q => q.status === 'pending').length})</div>
            </div>
            <div style={{ padding: 0 }}>
              {quotes.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#7AAAB2', fontSize: 13 }}>
                  No quotes tracked yet. Add one above.
                </div>
              ) : (
                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                  {quotes.map(q => (
                    <div key={q.id} style={{ padding: '12px 20px', borderBottom: '1px solid rgba(10,168,159,0.07)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>
                          {q.customer_name || q.customer_phone}
                          {q.quote_amount ? <span style={{ marginLeft: 8, color: '#0AA89F', fontWeight: 600 }}>${q.quote_amount.toLocaleString()}</span> : null}
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: q.status === 'won' ? '#ECFDF5' : q.status === 'lost' ? '#FEF2F2' : '#FFFBEB', color: q.status === 'won' ? '#059669' : q.status === 'lost' ? '#DC2626' : '#D97706' }}>
                          {q.status}
                        </div>
                      </div>
                      {q.quote_description && <div style={{ fontSize: 12, color: '#4A7A80', marginBottom: 4 }}>{q.quote_description}</div>}
                      <div style={{ fontSize: 11, color: '#7AAAB2' }}>
                        {q.followup_count} follow-up{q.followup_count !== 1 ? 's' : ''} sent
                        {q.next_followup_at && q.status === 'pending' ? ` · next: ${new Date(q.next_followup_at).toLocaleDateString()}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Collections */}
        <div>
          <div style={card}>
            <div style={cardHead}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Add a past-due invoice</div>
                <div style={{ fontSize: 11, color: '#7AAAB2', marginTop: 2 }}>SMS chases at day 2, 7, 14, 30 with your Stripe pay link.</div>
              </div>
            </div>
            <div style={cardBody}>
              <form onSubmit={addInvoice}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <span style={label}>Customer name</span>
                    <input style={input} value={iName} onChange={e => setIName(e.target.value)} placeholder="Bob Johnson" />
                  </div>
                  <div>
                    <span style={label}>Phone *</span>
                    <input style={input} value={iPhone} onChange={e => setIPhone(e.target.value)} placeholder="+17735551234" required />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <span style={label}>Amount due ($) *</span>
                    <input style={input} type="number" step="0.01" value={iAmount} onChange={e => setIAmount(e.target.value)} placeholder="850" required />
                  </div>
                  <div>
                    <span style={label}>Original due date</span>
                    <input style={input} type="date" value={iDue} onChange={e => setIDue(e.target.value)} />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <span style={label}>What was the job</span>
                  <input style={input} value={iDesc} onChange={e => setIDesc(e.target.value)} placeholder="Furnace repair, Oct 12" />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <span style={label}>Stripe payment link (optional but recommended)</span>
                  <input style={input} value={iLink} onChange={e => setILink(e.target.value)} placeholder="https://buy.stripe.com/..." />
                </div>
                <button
                  type="submit"
                  disabled={iSubmitting || !iPhone || !iAmount}
                  style={{
                    padding: '10px 22px',
                    borderRadius: 9,
                    border: 'none',
                    background: 'linear-gradient(135deg,#0AA89F,#0D8F87)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: iSubmitting || !iPhone || !iAmount ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {iSubmitting ? 'Adding…' : 'Track this invoice'}
                </button>
                {iMsg && <div style={{ marginTop: 10, fontSize: 12, color: iMsg.startsWith('Failed') ? '#DC2626' : '#15803D' }}>{iMsg}</div>}
              </form>
            </div>
          </div>

          {/* Invoice list */}
          <div style={card}>
            <div style={cardHead}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Past-due invoices ({invoices.filter(i => i.status === 'pending').length})</div>
            </div>
            <div style={{ padding: 0 }}>
              {invoices.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#7AAAB2', fontSize: 13 }}>
                  No past-due invoices tracked yet.
                </div>
              ) : (
                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                  {invoices.map(i => (
                    <div key={i.id} style={{ padding: '12px 20px', borderBottom: '1px solid rgba(10,168,159,0.07)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>
                          {i.customer_name || i.customer_phone}
                          <span style={{ marginLeft: 8, color: '#DC2626', fontWeight: 700 }}>${i.invoice_amount.toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: i.status === 'paid' ? '#ECFDF5' : i.status === 'written_off' ? '#F3F4F6' : '#FEF2F2', color: i.status === 'paid' ? '#059669' : i.status === 'written_off' ? '#6B7280' : '#DC2626' }}>
                          {i.status}
                        </div>
                      </div>
                      {i.invoice_description && <div style={{ fontSize: 12, color: '#4A7A80', marginBottom: 4 }}>{i.invoice_description}</div>}
                      <div style={{ fontSize: 11, color: '#7AAAB2' }}>
                        {i.chase_count} chase{i.chase_count !== 1 ? 's' : ''} sent
                        {i.next_chase_at && i.status === 'pending' ? ` · next: ${new Date(i.next_chase_at).toLocaleDateString()}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Review drafts (full width below) */}
      <div style={card}>
        <div style={cardHead}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Drafted Google review replies ({reviews.filter(r => r.status === 'drafted').length})</div>
            <div style={{ fontSize: 11, color: '#7AAAB2', marginTop: 2 }}>The AI drafts professional replies to new Google reviews. Approve, then copy to GMB.</div>
          </div>
        </div>
        <div style={{ padding: 0 }}>
          {reviews.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#7AAAB2', fontSize: 13 }}>
              No drafted replies yet. We start drafting once Google Place ID is set and you have new reviews.
            </div>
          ) : (
            reviews.map(r => (
              <div key={r.id} style={{ padding: '14px 20px', borderBottom: '1px solid rgba(10,168,159,0.07)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {r.review_author || 'Anonymous'} {r.review_rating ? `· ${'★'.repeat(r.review_rating)}${'☆'.repeat(5 - r.review_rating)}` : ''}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: r.status === 'approved' ? '#ECFDF5' : '#FFFBEB', color: r.status === 'approved' ? '#059669' : '#D97706' }}>
                    {r.status}
                  </div>
                </div>
                {r.review_text && <div style={{ fontSize: 12, color: '#4A7A80', marginBottom: 8, fontStyle: 'italic' }}>"{r.review_text}"</div>}
                <div style={{ fontSize: 12, color: '#0B1F3A', background: 'rgba(10,168,159,0.04)', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(10,168,159,0.1)' }}>
                  <strong style={{ color: '#0AA89F' }}>Drafted reply:</strong> {r.drafted_reply}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  )
}
