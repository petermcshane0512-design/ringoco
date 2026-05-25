'use client'

import { useEffect, useState } from 'react'

/**
 * Push Notification opt-in widget for the dashboard.
 *
 * Flow:
 *   1. Detect browser support + current permission state
 *   2. Show big "Enable lead alerts" button if not subscribed
 *   3. On click: register /sw.js, request Notification permission,
 *      subscribe to pushManager with VAPID public key, POST to backend
 *   4. After subscribed: show "✅ Notifications on · [Test] [Turn off]"
 *
 * iOS quirk: must be added to home screen first. Detect via display-mode
 * media query — if not standalone on iOS, show the "Add to Home Screen"
 * instructions instead of the subscribe button.
 */

type Status = 'loading' | 'unsupported' | 'needs-pwa-install' | 'denied' | 'unsubscribed' | 'subscribed' | 'subscribing'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

function detectIosNonStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const isIos = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
  if (!isIos) return false
  // True PWA mode reports display-mode standalone
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as { standalone?: boolean }).standalone === true
  return !standalone
}

export default function PushNotificationSetup() {
  const [status, setStatus] = useState<Status>('loading')
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Feature detection — bail out cleanly on unsupported browsers.
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported')
      return
    }

    // iOS Safari requires PWA install before push works.
    if (detectIosNonStandalone()) {
      setStatus('needs-pwa-install')
      return
    }

    if (Notification.permission === 'denied') {
      setStatus('denied')
      return
    }

    // Register SW eagerly on mount so navigator.serviceWorker.ready resolves
    // immediately. Without this, .ready hangs forever when no SW is
    // registered yet (it doesn't reject — it just never settles), leaving
    // the component stuck in `loading` and rendering nothing.
    ;(async () => {
      try {
        await navigator.serviceWorker.register('/sw.js')
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        setStatus(sub ? 'subscribed' : 'unsubscribed')
      } catch (e) {
        // SW registration can fail under odd conditions (HTTPS missing,
        // path 404, restrictive CSP). Treat as unsubscribed so the UI
        // still renders the CTA — user click will retry registration.
        console.warn('push: SW registration failed on mount:', e)
        setStatus('unsubscribed')
      }
    })()
  }, [])

  async function enable() {
    setStatus('subscribing')
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'denied' : 'unsubscribed')
        return
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // BufferSource cast: TS lib.dom signature wants BufferSource but
        // Uint8Array satisfies it at runtime. Cast keeps strict TS happy.
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      })

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      setStatus('subscribed')
    } catch (e) {
      console.error('push subscribe failed:', e)
      setStatus('unsubscribed')
      alert(`Couldn't enable notifications: ${(e as Error).message}`)
    }
  }

  async function disable() {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) await sub.unsubscribe()
      await fetch('/api/push/subscribe', { method: 'DELETE' })
      setStatus('unsubscribed')
    } catch (e) {
      alert(`Couldn't disable: ${(e as Error).message}`)
    }
  }

  async function sendTest() {
    setTesting(true)
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const j = await res.json()
      if (!res.ok || !j.ok) {
        alert(`Test failed: ${j.reason || j.error || 'unknown'}`)
      }
    } catch (e) {
      alert(`Test failed: ${(e as Error).message}`)
    } finally {
      setTesting(false)
    }
  }

  if (status === 'loading') return null

  // ── HERO state (unsubscribed) — massive, hard-to-miss until they enable.
  //    Once subscribed we collapse to a tiny pill that lives quietly in the
  //    corner so it's never obnoxious for active users.
  if (status === 'unsubscribed' || status === 'subscribing') {
    const heroStyle: React.CSSProperties = {
      background: 'linear-gradient(135deg, #0AA89F 0%, #088A82 60%, #FF9D5A 100%)',
      borderRadius: 20,
      padding: '32px 28px',
      marginBottom: 22,
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
      boxShadow: '0 12px 32px rgba(10, 168, 159, 0.28)',
      position: 'relative',
      overflow: 'hidden',
    }
    const headlineStyle: React.CSSProperties = {
      fontSize: 28,
      fontWeight: 900,
      letterSpacing: '-0.02em',
      lineHeight: 1.15,
      marginBottom: 10,
    }
    const subStyle: React.CSSProperties = {
      fontSize: 16,
      lineHeight: 1.4,
      opacity: 0.95,
      marginBottom: 22,
      maxWidth: 560,
    }
    const ctaStyle: React.CSSProperties = {
      background: '#fff',
      color: '#0B1F3A',
      border: 'none',
      padding: '18px 32px',
      borderRadius: 14,
      fontWeight: 900,
      fontSize: 18,
      cursor: status === 'subscribing' ? 'wait' : 'pointer',
      boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
      letterSpacing: '-0.01em',
      transition: 'transform 120ms ease',
    }
    return (
      <div style={heroStyle}>
        <div
          aria-hidden
          style={{
            position: 'absolute', top: -40, right: -40, fontSize: 180,
            opacity: 0.18, pointerEvents: 'none', userSelect: 'none',
          }}
        >
          🔔
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8, opacity: 0.9 }}>
            ⚡ ONE-TAP SETUP
          </div>
          <div style={headlineStyle}>Get lead alerts on your phone — like a text message.</div>
          <div style={subStyle}>
            Every time a customer calls, you&apos;ll get an instant banner on your phone with their name, problem, and a tap-to-call button. Same delivery as a text — without the wait for SMS approval. <strong>Set it up in 5 seconds.</strong>
          </div>
          <button
            style={ctaStyle}
            onClick={enable}
            disabled={status === 'subscribing'}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            {status === 'subscribing' ? 'Enabling…' : '🔔 Turn on Lead Alerts'}
          </button>
        </div>
      </div>
    )
  }

  if (status === 'needs-pwa-install') {
    // Big hero on iPhone Safari — they MUST install PWA before alerts work.
    return (
      <div
        style={{
          background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 100%)',
          borderRadius: 20,
          padding: '28px 24px',
          marginBottom: 22,
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          boxShadow: '0 12px 32px rgba(232, 116, 43, 0.28)',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8, opacity: 0.95 }}>
          📲 ONE-TIME IPHONE SETUP
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.15, marginBottom: 12, letterSpacing: '-0.02em' }}>
          Add BellAveGo to your Home Screen first
        </div>
        <ol style={{ fontSize: 15, lineHeight: 1.55, paddingLeft: 20, margin: '0 0 12px 0' }}>
          <li>Tap the <strong>Share</strong> icon (square with arrow) at the bottom of Safari</li>
          <li>Scroll → tap <strong>Add to Home Screen</strong> → tap <strong>Add</strong></li>
          <li>Close Safari and open BellAveGo from your home screen</li>
          <li>You&apos;ll see the &quot;Turn on Lead Alerts&quot; button — tap it</li>
        </ol>
        <div style={{ fontSize: 12, fontStyle: 'italic', opacity: 0.88 }}>
          Apple requires this step before push notifications work on iPhone — Android skips it.
        </div>
      </div>
    )
  }

  if (status === 'denied') {
    return (
      <div
        style={{
          background: '#FEF2F2',
          border: '2px solid #FCA5A5',
          borderRadius: 14,
          padding: 18,
          marginBottom: 22,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontWeight: 800, color: '#991B1B', marginBottom: 6, fontSize: 16 }}>
          🔕 Notifications are blocked for this site
        </div>
        <div style={{ color: '#7F1D1D', fontSize: 13, lineHeight: 1.5 }}>
          You previously blocked notifications. Re-enable them in your browser: click the <strong>lock icon</strong> in the address bar → <strong>Notifications</strong> → <strong>Allow</strong> → refresh this page.
        </div>
      </div>
    )
  }

  if (status === 'unsupported') {
    return (
      <div
        style={{
          background: '#FFF7ED',
          border: '1px solid #FED7AA',
          borderRadius: 12,
          padding: 12,
          marginBottom: 16,
          color: '#7C2D12',
          fontSize: 13,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        📵 This browser doesn&apos;t support push notifications. Use Chrome, Edge, Firefox, or Safari to get real-time lead alerts on your phone.
      </div>
    )
  }

  // ── COMPACT PILL state (subscribed) — tucked top-right, never obnoxious.
  //    Click toggles a small dropdown with Test / Turn off actions.
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: 12,
        fontFamily: 'system-ui, sans-serif',
        position: 'relative',
      }}
    >
      <details
        style={{
          background: '#ECFDF5',
          border: '1px solid #A7F3D0',
          borderRadius: 999,
          padding: '6px 14px',
          fontSize: 12,
          color: '#065F46',
          fontWeight: 700,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <summary
          style={{
            listStyle: 'none',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          ✅ Lead alerts on
        </summary>
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            background: '#fff',
            border: '1px solid #E8DFCF',
            borderRadius: 12,
            padding: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            zIndex: 50,
            minWidth: 220,
          }}
        >
          <div style={{ fontSize: 12, color: '#4A6670', fontWeight: 500, marginBottom: 10, lineHeight: 1.4 }}>
            You&apos;ll get a push on your phone for every captured lead and booked appointment — even with the dashboard closed.
          </div>
          <button
            onClick={sendTest}
            disabled={testing}
            style={{
              background: '#0AA89F', color: '#fff', border: 'none',
              padding: '8px 14px', borderRadius: 8, fontWeight: 700,
              fontSize: 12, cursor: testing ? 'wait' : 'pointer', width: '100%', marginBottom: 6,
            }}
          >
            {testing ? 'Sending…' : 'Send Test Notification'}
          </button>
          <button
            onClick={disable}
            style={{
              background: 'transparent', color: '#4A6670', border: '1px solid #E8DFCF',
              padding: '8px 14px', borderRadius: 8, fontWeight: 600,
              fontSize: 12, cursor: 'pointer', width: '100%',
            }}
          >
            Turn off alerts
          </button>
        </div>
      </details>
    </div>
  )
}
