import { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'

export const runtime = 'edge'

/**
 * Dynamic OG image for /sample-report?for=BusinessName.
 *
 * Renders a 1200x630 PNG with the prospect's business name front-and-center,
 * BellAveGo branding, and a "Growth Report" framing so the iMessage / Slack / X
 * link preview is the entire pitch.
 *
 * URL: /api/og/sample-report?for=Smith+HVAC&zip=30309&type=HVAC
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const businessName = (url.searchParams.get('for') || url.searchParams.get('business') || '').trim()
  const businessType = (url.searchParams.get('type') || '').trim()

  const hasName = businessName.length > 0
  const displayName = hasName ? businessName : 'Your Business'
  const subline = hasName
    ? `${businessType ? businessType + ' · ' : ''}Personalized Growth Report`
    : 'AI Consulting Sample Report'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background:
            'radial-gradient(900px 500px at 80% 20%, rgba(10,168,159,0.42), transparent 65%), radial-gradient(700px 400px at 10% 90%, rgba(94,234,212,0.28), transparent 70%), linear-gradient(135deg, #050E1F 0%, #0B1F3A 50%, #163356 100%)',
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '64px 72px',
          position: 'relative',
        }}
      >
        {/* Grid overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(94,234,212,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(94,234,212,0.06) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            display: 'flex',
          }}
        />

        {/* Header / brand row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 'auto' }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 99,
              background: '#5EEAD4',
              boxShadow: '0 0 20px rgba(94,234,212,0.6)',
              display: 'flex',
            }}
          />
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: '#5EEAD4',
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              display: 'flex',
            }}
          >
            BellAveGo · AI Consulting
          </div>
        </div>

        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.72)',
              letterSpacing: '-0.01em',
              marginBottom: 18,
              display: 'flex',
            }}
          >
            Growth Report for
          </div>
          <div
            style={{
              fontSize: hasName && displayName.length < 24 ? 96 : displayName.length < 38 ? 72 : 56,
              fontWeight: 900,
              letterSpacing: '-0.04em',
              lineHeight: 1.0,
              background: 'linear-gradient(135deg, #fff 0%, #5EEAD4 100%)',
              backgroundClip: 'text',
              color: 'transparent',
              maxWidth: '100%',
              display: 'flex',
              flexWrap: 'wrap',
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.55)',
              marginTop: 16,
              display: 'flex',
            }}
          >
            {subline}
          </div>
        </div>

        {/* Footer row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginTop: 'auto',
            paddingTop: 32,
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 16, color: '#5EEAD4', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex' }}>
              3 opportunities · 5-step plan
            </div>
            <div style={{ fontSize: 22, color: 'rgba(255,255,255,0.86)', fontWeight: 600, display: 'flex' }}>
              Based on your real local market.
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '14px 24px',
              borderRadius: 14,
              background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
              fontSize: 22,
              fontWeight: 800,
              color: '#fff',
              boxShadow: '0 12px 32px rgba(34,197,94,0.42)',
            }}
          >
            View on bellavego.com →
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, immutable',
      },
    },
  )
}
