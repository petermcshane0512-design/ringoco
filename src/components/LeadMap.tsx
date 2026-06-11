'use client'

import { useMemo, useState } from 'react'

/**
 * LeadMap — 2026-06-11 per Peter: "Google Maps opened with a pin on our
 * client's address and different pins on the ten leads... click a pin and
 * it opens that lead below... zoomed out to the point where all ten leads
 * are shown around the client's address."
 *
 * Implementation: one Static Maps image (via the existing
 * /api/google-static-map proxy — key stays server-side, $2/1K, edge-
 * cached) as the background, with OUR OWN absolutely-positioned DOM pins
 * projected onto it via Web Mercator math. DOM pins = fully clickable +
 * styleable, no Maps JS SDK, no client-side API key, no per-load JS cost.
 *
 * Projection: we choose the zoom ourselves (largest integer zoom where
 * the bounding box of [business + all leads] fits inside ~82% of the
 * frame), request the image at that exact center/zoom, then place pins
 * at percentage offsets computed with the same Mercator transform Google
 * uses. Percentages scale with the responsive rendered size.
 */

const MAP_W = 640 // static map logical px (Google free-tier max 640)
const MAP_H = 360
const FIT = 0.82  // bounds must fit inside this fraction of the frame

function mercX(lng: number): number {
  return (lng + 180) / 360
}
function mercY(lat: number): number {
  const r = (lat * Math.PI) / 180
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2
}
function invMercY(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI
}

export type MapLead = {
  id: string
  lat: number
  lng: number
  label: string      // "1"-based index shown in the pin
  title: string      // tooltip
  hasPhone: boolean
}

export default function LeadMap({
  businessLat,
  businessLng,
  leads,
  onPinClick,
}: {
  businessLat: number
  businessLng: number
  leads: MapLead[]
  onPinClick: (leadId: string) => void
}) {
  const [hovered, setHovered] = useState<string | null>(null)

  const view = useMemo(() => {
    const xs = [mercX(businessLng), ...leads.map((l) => mercX(l.lng))]
    const ys = [mercY(businessLat), ...leads.map((l) => mercY(l.lat))]
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2

    // Largest zoom that fits the bounds in FIT × frame. Clamp 11–16 so a
    // single-lead map doesn't zoom to rooftop level and a weird outlier
    // doesn't zoom out to the whole state.
    let zoom = 16
    for (; zoom > 11; zoom--) {
      const world = 256 * Math.pow(2, zoom)
      if ((maxX - minX) * world <= MAP_W * FIT && (maxY - minY) * world <= MAP_H * FIT) break
    }
    const world = 256 * Math.pow(2, zoom)

    const toPct = (lat: number, lng: number) => ({
      left: ((mercX(lng) - cx) * world + MAP_W / 2) / MAP_W * 100,
      top: ((mercY(lat) - cy) * world + MAP_H / 2) / MAP_H * 100,
    })

    return {
      zoom,
      centerLat: invMercY(cy),
      centerLng: cx * 360 - 180,
      toPct,
    }
  }, [businessLat, businessLng, leads])

  const src = `/api/google-static-map?center=${view.centerLat.toFixed(6)},${view.centerLng.toFixed(6)}&zoom=${view.zoom}&size=${MAP_W}x${MAP_H}&scale=2`
  const biz = view.toPct(businessLat, businessLng)

  return (
    <div style={{
      position: 'relative',
      borderRadius: 16,
      overflow: 'hidden',
      border: '1.5px solid rgba(255,157,90,0.28)',
      boxShadow: '0 18px 50px rgba(11,31,58,0.35)',
      marginBottom: 16,
      aspectRatio: `${MAP_W} / ${MAP_H}`,
      background: '#0B1F3A',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Map of your leads"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* Business pin — your shop */}
      <div
        title="Your shop"
        style={{
          position: 'absolute',
          left: `${biz.left}%`,
          top: `${biz.top}%`,
          transform: 'translate(-50%, -100%)',
          zIndex: 3,
          pointerEvents: 'none',
          textAlign: 'center',
        }}
      >
        <div style={{
          padding: '3px 8px', borderRadius: 7, marginBottom: 2,
          background: '#0B1F3A', border: '1.5px solid #FF9D5A',
          color: '#FFC58A', fontSize: 9.5, fontWeight: 900, whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          YOUR SHOP
        </div>
        <div style={{ fontSize: 26, lineHeight: 1, filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.5))' }}>📍</div>
      </div>

      {/* Lead pins — numbered, clickable */}
      {leads.map((l) => {
        const p = view.toPct(l.lat, l.lng)
        const isHover = hovered === l.id
        return (
          <button
            key={l.id}
            onClick={() => onPinClick(l.id)}
            onMouseEnter={() => setHovered(l.id)}
            onMouseLeave={() => setHovered(null)}
            title={l.title}
            style={{
              position: 'absolute',
              left: `${p.left}%`,
              top: `${p.top}%`,
              transform: `translate(-50%, -50%) scale(${isHover ? 1.25 : 1})`,
              zIndex: isHover ? 4 : 2,
              width: 26, height: 26, borderRadius: '50%',
              border: '2px solid #fff',
              background: l.hasPhone
                ? 'linear-gradient(135deg, #FF9D5A, #E8742B)'
                : 'linear-gradient(135deg, #64748B, #475569)',
              color: '#fff', fontSize: 11, fontWeight: 900,
              cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 10px rgba(0,0,0,0.45)',
              transition: 'transform 140ms ease',
              fontFamily: 'inherit',
            }}
          >
            {l.label}
          </button>
        )
      })}

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 8, left: 8, zIndex: 3,
        display: 'flex', gap: 10, alignItems: 'center',
        padding: '5px 10px', borderRadius: 8,
        background: 'rgba(8,20,39,0.85)', backdropFilter: 'blur(6px)',
        fontSize: 9.5, fontWeight: 700, color: 'rgba(255,248,240,0.75)',
      }}>
        <span><i style={legendDot('linear-gradient(135deg, #FF9D5A, #E8742B)')} /> phone verified</span>
        <span><i style={legendDot('linear-gradient(135deg, #64748B, #475569)')} /> address only</span>
        <span>· tap a pin to open the lead</span>
      </div>
    </div>
  )
}

function legendDot(bg: string): React.CSSProperties {
  return {
    display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
    background: bg, marginRight: 4, verticalAlign: 'middle',
    border: '1px solid rgba(255,255,255,0.7)',
  }
}
