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

    // Check if already subscribed
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setStatus(sub ? 'subscribed' : 'unsubscribed')
    }).catch(() => {
      // Service worker not yet registered — treat as unsubscribed
      setStatus('unsubscribed')
    })
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

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #E8DFCF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    fontFamily: 'system-ui, sans-serif',
  }
  const btnPrimary: React.CSSProperties = {
    background: '#0AA89F',
    color: '#fff',
    border: 'none',
    padding: '10px 16px',
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
  }
  const btnGhost: React.CSSProperties = {
    background: 'transparent',
    color: '#4A6670',
    border: '1px solid #E8DFCF',
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 13,
    cursor: 'pointer',
    marginLeft: 8,
  }

  if (status === 'unsupported') {
    return (
      <div style={cardStyle}>
        <div style={{ color: '#4A6670', fontSize: 13 }}>
          📵 Push notifications aren't supported in this browser. Use Chrome, Edge, Firefox, or Safari to enable real-time lead alerts.
        </div>
      </div>
    )
  }

  if (status === 'needs-pwa-install') {
    return (
      <div style={cardStyle}>
        <div style={{ fontWeight: 700, color: '#0B1F3A', marginBottom: 6 }}>
          📲 Add BellAveGo to your Home Screen first
        </div>
        <div style={{ color: '#4A6670', fontSize: 13, marginBottom: 4 }}>
          On iPhone: tap the <strong>Share</strong> icon at the bottom of Safari → <strong>Add to Home Screen</strong>. Then open BellAveGo from your home screen to turn on lead alerts.
        </div>
        <div style={{ color: '#4A6670', fontSize: 12, fontStyle: 'italic' }}>
          (Apple requires this step before push notifications work on iPhone.)
        </div>
      </div>
    )
  }

  if (status === 'denied') {
    return (
      <div style={cardStyle}>
        <div style={{ fontWeight: 700, color: '#0B1F3A', marginBottom: 6 }}>
          🔕 Notifications are blocked
        </div>
        <div style={{ color: '#4A6670', fontSize: 13 }}>
          You blocked notifications for this site. Re-enable in your browser settings (lock icon in the address bar → Notifications → Allow), then refresh.
        </div>
      </div>
    )
  }

  if (status === 'subscribed') {
    return (
      <div style={cardStyle}>
        <div style={{ fontWeight: 700, color: '#0B1F3A', marginBottom: 6 }}>
          ✅ Lead alerts are on
        </div>
        <div style={{ color: '#4A6670', fontSize: 13, marginBottom: 10 }}>
          You'll get a push notification every time the AI captures a lead or books an appointment — even when this tab is closed.
        </div>
        <button style={btnPrimary} onClick={sendTest} disabled={testing}>
          {testing ? 'Sending…' : 'Send Test Notification'}
        </button>
        <button style={btnGhost} onClick={disable}>Turn off</button>
      </div>
    )
  }

  // unsubscribed or subscribing
  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 700, color: '#0B1F3A', marginBottom: 6 }}>
        🔔 Get instant lead alerts on your phone
      </div>
      <div style={{ color: '#4A6670', fontSize: 13, marginBottom: 12 }}>
        One tap and you'll get a push notification within 2 seconds of every captured lead or booked appointment. No app to install — works in this browser.
      </div>
      <button style={btnPrimary} onClick={enable} disabled={status === 'subscribing'}>
        {status === 'subscribing' ? 'Enabling…' : 'Enable Lead Alerts'}
      </button>
    </div>
  )
}
