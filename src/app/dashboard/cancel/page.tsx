'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

/**
 * /dashboard/cancel
 *
 * Honors the pricing-page guarantee. One-click cancel + auto-refund
 * if within 30 days. Per Hormozi $100M Offers — risk reversal MUST be
 * frictionless. No phone-call cancellation. No 5-step downgrade flow.
 */

type CancelResponse = {
  ok: boolean
  cancelled: boolean
  refund_issued: boolean
  refund_amount_cents: number
  refund_id: string | null
  outside_window: boolean
  message: string
  error?: string
}

export default function CancelPage() {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<CancelResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const r = await fetch('/api/stripe/cancel-and-refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const j = await r.json() as CancelResponse
      if (!r.ok || !j.ok) {
        setError(j.error || 'Cancellation failed. Email peter@bellavego.com.')
        setSubmitting(false)
        return
      }
      setResult(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <main style={shellStyle}>
        <div style={{ ...card, textAlign: 'center', maxWidth: 560 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{result.refund_issued ? '💸' : '✓'}</div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0B1F3A', marginBottom: 8 }}>
            {result.refund_issued ? 'Refund issued.' : 'Subscription cancelled.'}
          </h1>
          <p style={{ fontSize: 15, color: '#4A6670', lineHeight: 1.55, marginBottom: 22 }}>
            {result.message}
          </p>
          {result.refund_issued && (
            <p style={{ fontSize: 13, color: '#16A34A', fontWeight: 700, marginBottom: 22 }}>
              ${(result.refund_amount_cents / 100).toFixed(2)} back on your card in 5-10 business days.
            </p>
          )}
          <p style={{ fontSize: 12, color: '#7AAAB2', marginBottom: 22 }}>
            Your AI receptionist is now offline. You can re-subscribe anytime.
          </p>
          <Link href="/" style={{
            display: 'inline-block', padding: '12px 28px',
            background: '#0AA89F', color: '#fff', borderRadius: 10,
            fontSize: 14, fontWeight: 800, textDecoration: 'none',
          }}>Back to homepage →</Link>
        </div>
      </main>
    )
  }

  return (
    <main style={shellStyle}>
      <Link href="/dashboard" style={backLink}>← Dashboard</Link>

      <div style={card}>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.5px', marginBottom: 8 }}>
          Cancel your BellAveGo subscription
        </h1>
        <p style={{ fontSize: 14, color: '#4A6670', lineHeight: 1.55, marginBottom: 22 }}>
          Honest goodbye. No retention call. No "are you sure" loops. One click cancels everything immediately.
        </p>

        <div style={{
          background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
          border: '2px solid #F59E0B',
          borderRadius: 14,
          padding: '18px 20px',
          marginBottom: 22,
        }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: '#92400E', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6 }}>
            🏆 30-day money-back guarantee
          </div>
          <p style={{ fontSize: 13.5, color: '#78350F', lineHeight: 1.5, margin: 0 }}>
            If you&apos;re within 30 days of your first paid charge, we&apos;ll refund your most recent payment immediately. After 30 days, you keep service through end of billing cycle — no further charges.
          </p>
        </div>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#7AAAB2', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
          Why are you cancelling? (optional — helps us improve)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Didn't book enough jobs, calls were robotic, prefer human receptionist..."
          rows={4}
          maxLength={500}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 10,
            border: '1.5px solid rgba(10,168,159,0.2)', background: '#F5FDFB',
            fontSize: 14, color: '#0B1F3A', fontFamily: 'inherit',
            outline: 'none', marginBottom: 22, resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            style={{
              width: '100%', padding: '14px',
              background: '#fff', color: '#DC2626',
              border: '2px solid #DC2626', borderRadius: 10,
              fontSize: 14, fontWeight: 800, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel my subscription
          </button>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: '#0B1F3A', fontWeight: 700, marginBottom: 12, textAlign: 'center' }}>
              Confirm: cancel + refund (if within 30 days)?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirming(false)}
                disabled={submitting}
                style={{
                  flex: 1, padding: '14px',
                  background: '#fff', color: '#4A6670',
                  border: '1.5px solid rgba(10,168,159,0.2)', borderRadius: 10,
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Nevermind
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                style={{
                  flex: 1, padding: '14px',
                  background: '#DC2626', color: '#fff',
                  border: 'none', borderRadius: 10,
                  fontSize: 14, fontWeight: 800, cursor: submitting ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? 'Cancelling…' : 'Yes, cancel + refund'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 18, padding: '12px 14px', background: '#FEE2E2', color: '#991B1B', borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        )}

        <p style={{ fontSize: 11, color: '#A0BCC2', textAlign: 'center', marginTop: 22 }}>
          Questions? Text Peter directly at <a href="tel:+17737109565" style={{ color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>(773) 710-9565</a>
        </p>
      </div>
    </main>
  )
}

const shellStyle: React.CSSProperties = {
  maxWidth: 640,
  margin: '0 auto',
  padding: '24px 20px 80px',
  fontFamily: "'Inter', system-ui, sans-serif",
  background: '#F5FCFA',
  minHeight: '100vh',
}

const backLink: React.CSSProperties = {
  fontSize: 12,
  color: '#0AA89F',
  fontWeight: 700,
  textDecoration: 'none',
  display: 'inline-block',
  marginBottom: 14,
}

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: '28px 32px',
  border: '1px solid rgba(10,168,159,0.14)',
  boxShadow: '0 8px 24px rgba(7,27,58,0.06)',
}
