'use client'

import { useEffect, useState } from 'react'

/**
 * Multi-device push notification opt-in widget.
 *
 * Renders different UI based on THIS DEVICE's subscription state AND the
 * total number of devices the user has registered:
 *
 *   - This device subscribed + ≥1 other device     → tiny green pill
 *   - This device subscribed + no other devices    → green pill + "📱 Also enable on phone" CTA
 *   - This device NOT subscribed                   → big hero CTA
 *   - iPhone Safari not yet PWA-installed          → orange "Add to Home Screen" hero
 *   - Blocked / unsupported                        → warning banner
 *
 * Key insight: enabling on a laptop DOES NOT enable on the phone — they're
 * separate browsers with separate subscriptions. The component nudges
 * users hard to set up BOTH so leads land on whichever device they're on.
 */

type Status =
  | 'loading'
  | 'unsupported'
  | 'needs-pwa-install'
  | 'denied'
  | 'unsubscribed'
  | 'subscribed'
  | 'subscribing'

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
  // iPad on iPadOS 13+ reports as Macintosh — use maxTouchPoints fallback
  // (Mac desktops report 0, iPads report 5+).
  const isMacWithTouch = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1
  const isIos =
    (/iPhone|iPad|iPod/.test(ua) || isMacWithTouch) &&
    !/CriOS|FxiOS|EdgiOS/.test(ua)
  if (!isIos) return false
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  return !standalone
}

function detectMobile(): boolean {
  if (typeof window === 'undefined') return false
  return /iPhone|iPad|iPod|Android/.test(window.navigator.userAgent)
}

type DeviceRow = { device_label: string | null; last_seen_at: string | null }

export default function PushNotificationSetup() {
  const [status, setStatus] = useState<Status>('loading')
  const [testing, setTesting] = useState(false)
  const [textingLink, setTextingLink] = useState(false)
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null)
  const isOnMobile = typeof window !== 'undefined' ? detectMobile() : false

  async function refreshDeviceList() {
    try {
      const res = await fetch('/api/push/subscribe')
      if (res.ok) {
        const j = await res.json()
        setDevices(j.devices || [])
      }
    } catch {
      // Non-fatal — device list is informational only
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    // ORDER MATTERS: check iOS non-standalone BEFORE feature detection.
    // iOS Safari doesn't expose PushManager until the PWA is added to
    // the home screen and launched in standalone mode. If we feature-
    // detect first, every iPhone user sees "browser unsupported"
    // instead of the actual "add to home screen" instructions — the
    // exact thing they need to do to make push work.
    if (detectIosNonStandalone()) {
      setStatus('needs-pwa-install')
      return
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setStatus('denied')
      return
    }

    ;(async () => {
      try {
        await navigator.serviceWorker.register('/sw.js')
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        setThisEndpoint(sub?.endpoint ?? null)
        setStatus(sub ? 'subscribed' : 'unsubscribed')
        if (sub) refreshDeviceList()
      } catch (e) {
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
      setThisEndpoint(sub.endpoint)
      setStatus('subscribed')
      await refreshDeviceList()
    } catch (e) {
      console.error('push subscribe failed:', e)
      setStatus('unsubscribed')
      alert(`Couldn't enable notifications: ${(e as Error).message}`)
    }
  }

  async function disableThisDevice() {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setThisEndpoint(null)
      setStatus('unsubscribed')
      await refreshDeviceList()
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

  async function textMeLink() {
    setTextingLink(true)
    try {
      const res = await fetch('/api/push/text-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const j = await res.json()
      if (!res.ok) {
        alert(j.error || 'Could not send link — try copying https://www.bellavego.com/dashboard to your phone manually.')
      } else {
        alert(`Sent! Check your phone (${j.sent_to}) and tap the link to set up alerts there.`)
      }
    } catch (e) {
      alert(`Failed: ${(e as Error).message}`)
    } finally {
      setTextingLink(false)
    }
  }

  if (status === 'loading') return null

  // ── HERO state (this device NOT subscribed) ──
  if (status === 'unsubscribed' || status === 'subscribing') {
    return (
      <div
        style={{
          background: 'linear-gradient(135deg, #0AA89F 0%, #088A82 60%, #FF9D5A 100%)',
          borderRadius: 20,
          padding: '32px 28px',
          marginBottom: 22,
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          boxShadow: '0 12px 32px rgba(10, 168, 159, 0.28)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
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
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 10 }}>
            Get lead alerts on {isOnMobile ? 'your phone' : 'this device'} — like a text message.
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.4, opacity: 0.95, marginBottom: 22, maxWidth: 560 }}>
            Every time a customer calls, you&apos;ll get an instant banner with their name, problem, and a tap-to-call button. Same delivery as a text — works during our A2P SMS setup. <strong>Set it up in 5 seconds.</strong>
          </div>
          <button
            style={{
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
            }}
            onClick={enable}
            disabled={status === 'subscribing'}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            {status === 'subscribing' ? 'Enabling…' : '🔔 Turn on Lead Alerts'}
          </button>
          {!isOnMobile && (
            <div style={{ marginTop: 16, fontSize: 13, opacity: 0.88 }}>
              💡 After enabling here, also turn it on for your phone so you get alerts on the road.
              <button
                onClick={textMeLink}
                disabled={textingLink}
                style={{
                  marginLeft: 8,
                  background: 'rgba(255,255,255,0.18)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.4)',
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: textingLink ? 'wait' : 'pointer',
                }}
              >
                {textingLink ? 'Texting…' : '📲 Text me the link'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── iPhone needs PWA install ──
  if (status === 'needs-pwa-install') {
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
          <li>
            Tap the <strong>Share</strong> icon{' '}
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32, height: 32,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.18)',
              border: '1.5px solid rgba(255,255,255,0.45)',
              verticalAlign: 'middle',
              margin: '0 4px',
            }}>
              <svg width="18" height="20" viewBox="0 0 24 26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 13v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="16" />
              </svg>
            </span>
            {' '}at the bottom of Safari
          </li>
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

  // ── Blocked ──
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
          🔕 Notifications are blocked on this device
        </div>
        <div style={{ color: '#7F1D1D', fontSize: 13, lineHeight: 1.5 }}>
          You previously blocked notifications. Re-enable them in your browser: click the <strong>lock icon</strong> in the address bar → <strong>Notifications</strong> → <strong>Allow</strong> → refresh this page.
        </div>
      </div>
    )
  }

  // ── Unsupported ──
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

  // ── SUBSCRIBED state ──
  // Two sub-cases:
  //   A) Only 1 device subscribed AND we're NOT on mobile → big "set up phone too" prompt
  //   B) Multiple devices (or just 1 and they're already on mobile) → tiny pill in corner
  const deviceCount = devices.length || 1
  const showPhoneNudge = !isOnMobile && deviceCount < 2

  if (showPhoneNudge) {
    return (
      <div
        style={{
          background: 'linear-gradient(135deg, #ECFDF5 0%, #FEF3C7 100%)',
          border: '1px solid #A7F3D0',
          borderRadius: 16,
          padding: '20px 22px',
          marginBottom: 22,
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 18,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 320px' }}>
          <div style={{ fontWeight: 800, color: '#065F46', fontSize: 16, marginBottom: 4 }}>
            ✅ Lead alerts on for this computer — now set it up on your phone
          </div>
          <div style={{ fontSize: 13, color: '#0B1F3A', lineHeight: 1.5 }}>
            Web Push is per-device. To get alerts when you&apos;re on the road, you need to enable it on your phone too. We&apos;ll text you the link — tap it on your phone, add to Home Screen, tap &quot;Turn on Lead Alerts&quot; there.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={textMeLink}
            disabled={textingLink}
            style={{
              background: '#0AA89F',
              color: '#fff',
              border: 'none',
              padding: '12px 20px',
              borderRadius: 12,
              fontWeight: 800,
              fontSize: 14,
              cursor: textingLink ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {textingLink ? 'Sending…' : '📲 Text me the link'}
          </button>
          <button
            onClick={sendTest}
            disabled={testing}
            style={{
              background: 'transparent',
              color: '#065F46',
              border: '1px solid #A7F3D0',
              padding: '8px 14px',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              cursor: testing ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {testing ? 'Sending…' : 'Send Test'}
          </button>
        </div>
      </div>
    )
  }

  // ── Compact pill (multi-device or mobile-only user) ──
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
        <summary style={{ listStyle: 'none', cursor: 'pointer', outline: 'none' }}>
          ✅ Alerts on · {deviceCount} {deviceCount === 1 ? 'device' : 'devices'}
        </summary>
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            background: '#fff',
            border: '1px solid #E8DFCF',
            borderRadius: 12,
            padding: 14,
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            zIndex: 50,
            minWidth: 260,
          }}
        >
          <div style={{ fontSize: 11, color: '#4A6670', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Subscribed devices
          </div>
          <div style={{ marginBottom: 12, maxHeight: 140, overflowY: 'auto' }}>
            {devices.length === 0 ? (
              <div style={{ fontSize: 12, color: '#4A6670' }}>This device</div>
            ) : (
              devices.map((d, i) => (
                <div key={i} style={{ fontSize: 12, color: '#0B1F3A', padding: '4px 0', fontWeight: 500 }}>
                  📱 {d.device_label || 'Unknown device'}
                </div>
              ))
            )}
          </div>
          {!isOnMobile && (
            <button
              onClick={textMeLink}
              disabled={textingLink}
              style={{
                background: '#0AA89F', color: '#fff', border: 'none',
                padding: '8px 12px', borderRadius: 8, fontWeight: 700,
                fontSize: 12, cursor: textingLink ? 'wait' : 'pointer',
                width: '100%', marginBottom: 6,
              }}
            >
              {textingLink ? 'Sending…' : '📲 Text link to another device'}
            </button>
          )}
          <button
            onClick={sendTest}
            disabled={testing}
            style={{
              background: '#0AA89F', color: '#fff', border: 'none',
              padding: '8px 12px', borderRadius: 8, fontWeight: 700,
              fontSize: 12, cursor: testing ? 'wait' : 'pointer',
              width: '100%', marginBottom: 6,
            }}
          >
            {testing ? 'Sending…' : 'Send Test Notification'}
          </button>
          <button
            onClick={disableThisDevice}
            style={{
              background: 'transparent', color: '#4A6670', border: '1px solid #E8DFCF',
              padding: '8px 12px', borderRadius: 8, fontWeight: 600,
              fontSize: 12, cursor: 'pointer', width: '100%',
            }}
          >
            Turn off on this device
          </button>
        </div>
      </details>
    </div>
  )
}
