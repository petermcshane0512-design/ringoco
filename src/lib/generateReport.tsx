/* eslint-disable jsx-a11y/alt-text */
import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer, Image } from '@react-pdf/renderer'

// ── Brand colors ────────────────────────────────────────────────
const TEAL = '#0AA89F'
const TEAL_DARK = '#0D8F87'
const NAVY = '#0B1F3A'
const SLATE = '#4A7A80'
const MIST = '#7AAAB2'
const MIST_LIGHT = '#F5FDFB'
const GREEN = '#22C55E'
const AMBER = '#F59E0B'
const PAPER = '#FFFFFF'

// ── Types ───────────────────────────────────────────────────────
export type ReportInput = {
  businessName: string
  reportTitle: string                     // e.g., "Welcome Report" or "Q1 2026 Performance Report"
  periodLabel: string                     // e.g., "May 9 – Aug 9, 2026"
  generatedFor: string                    // owner first name
  serviceArea: string                     // e.g., "metro Atlanta"
  metrics: {
    callsReceived: number
    callsAnswered: number
    jobsBooked: number
    jobsCompleted: number
    totalRevenue: number
    avgJobValue: number
    peakUnansweredHour: string            // e.g., "Tue 2–4 PM"
    topJobType: string                    // e.g., "HVAC repair"
  }
  market: {
    competitorCount: number
    avgCompetitorRating: number           // 0-5
    topCompetitors: { name: string; rating: number; reviewCount: number }[]
    customerRank: number                  // 1 = top
    // ── NEW (May 2026): real geographic pins for the PDF map ──
    // Optional — when present, the PDF renders a Google Static Maps image
    // with real markers for the customer's business + top competitors.
    mapCenter?: { lat: number; lng: number }
    mapPoints?: Array<{
      lat: number
      lng: number
      kind: 'business' | 'competitor' | 'opportunity'
      label: string                       // 1-2 char marker label ("Y", "1", "2"...)
    }>
  }
  bellaveGoScore: {
    composite: number                     // 1-10
    breakdown: { label: string; value: number; max: number }[]  // each 0-10 scaled
  }
  opportunity: {
    headline: string                      // 1 line
    body: string                          // 2-3 sentences
    estimatedValue: string                // e.g., "$3,200/mo"
  }
  nextQuarter: string                     // 1-2 sentences
}

// ── Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    backgroundColor: PAPER,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: NAVY,
    padding: 0,
  },

  // Header band
  header: {
    backgroundColor: NAVY,
    padding: '20 28',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: PAPER, letterSpacing: -0.4 },
  headerSubtitle: { fontSize: 9, color: '#9CB7C0', marginTop: 3 },
  headerBrand: { fontSize: 10, color: TEAL, fontWeight: 'bold', letterSpacing: 1.5, textTransform: 'uppercase' },
  headerBrandSub: { fontSize: 8, color: '#7A8B95', marginTop: 2 },

  // Body container
  body: { padding: '20 28' },
  section: { marginBottom: 14 },
  sectionLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: TEAL,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', color: NAVY, marginBottom: 8, letterSpacing: -0.2 },

  // Stat cards row
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: MIST_LIGHT,
    borderRadius: 6,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: TEAL,
  },
  statLabel: {
    fontSize: 7,
    color: MIST,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
    fontWeight: 'bold',
  },
  statValue: { fontSize: 18, fontWeight: 'bold', color: NAVY, letterSpacing: -0.5 },
  statSub: { fontSize: 7, color: SLATE, marginTop: 2 },

  // Service area map (real Google Static Maps with markers)
  mapImage: {
    width: '100%',
    height: 200,
    objectFit: 'cover',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  mapLegend: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  mapLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  mapLegendDot: { width: 8, height: 8, borderRadius: 4 },
  mapLegendText: { fontSize: 7, color: SLATE },

  // Score block
  scoreRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  scoreBox: {
    width: 110,
    backgroundColor: NAVY,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreLabel: { fontSize: 7, color: TEAL, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 'bold', marginBottom: 4 },
  scoreNumber: { fontSize: 36, fontWeight: 'bold', color: PAPER, lineHeight: 1 },
  scoreOf: { fontSize: 9, color: MIST, marginTop: 2 },
  scoreBreakdown: { flex: 1, justifyContent: 'space-between' },
  scoreRowItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  scoreRowLabel: { fontSize: 8, color: SLATE, width: 110 },
  scoreBar: { flex: 1, height: 5, backgroundColor: '#E6F0F2', borderRadius: 3, marginHorizontal: 8 },
  scoreBarFill: { height: 5, backgroundColor: TEAL, borderRadius: 3 },
  scoreRowValue: { fontSize: 8, color: NAVY, fontWeight: 'bold', width: 28, textAlign: 'right' },

  // Market block
  marketRow: { flexDirection: 'row', gap: 8 },
  marketCard: {
    flex: 1,
    backgroundColor: MIST_LIGHT,
    borderRadius: 6,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: AMBER,
  },
  competitorList: { marginTop: 4 },
  competitorItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E6F0F2',
  },
  competitorName: { fontSize: 8, color: NAVY, fontWeight: 'bold' },
  competitorRating: { fontSize: 8, color: SLATE },

  // Opportunity callout
  opportunity: {
    backgroundColor: '#F0FAF7',
    borderRadius: 8,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: GREEN,
  },
  opportunityHead: { fontSize: 11, fontWeight: 'bold', color: NAVY, marginBottom: 4 },
  opportunityBody: { fontSize: 9, color: SLATE, lineHeight: 1.5 },
  opportunityValue: {
    fontSize: 9,
    color: GREEN,
    fontWeight: 'bold',
    marginTop: 6,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F5FDFB',
    padding: '10 28',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#D4E6DC',
  },
  footerText: { fontSize: 7, color: MIST },
  footerBrand: { fontSize: 8, color: TEAL, fontWeight: 'bold', letterSpacing: 0.8 },
})

// ── Helpers ─────────────────────────────────────────────────────
function fmtUSD(n: number) {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
function fmtPct(n: number) {
  return Math.round(n * 100) + '%'
}

// ── PDF document ────────────────────────────────────────────────
/**
 * Build a Google Static Maps URL with real markers. Routes through our own
 * proxy so the API key stays server-side. The proxy supports the `markers`
 * query param (can repeat) — passed through verbatim to Google.
 *
 * Marker format: color:<color>|label:<char>|<lat>,<lng>
 * Customer = teal (closest to brand), competitors = amber numbers 1-5.
 */
function buildStaticMapUrl(
  center: { lat: number; lng: number },
  points: NonNullable<ReportInput['market']['mapPoints']>,
): string {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
      ? process.env.NEXT_PUBLIC_APP_URL
      : 'https://www.bellavego.com'
  ) + '/api/google-static-map'
  const params = new URLSearchParams()
  params.set('center', `${center.lat.toFixed(6)},${center.lng.toFixed(6)}`)
  params.set('zoom', '12')
  params.set('size', '600x300')
  for (const p of points.slice(0, 10)) {
    const color = p.kind === 'business' ? '0x0AA89F' : p.kind === 'opportunity' ? '0x22C55E' : '0xF59E0B'
    params.append(
      'markers',
      `color:${color}|label:${p.label}|${p.lat.toFixed(6)},${p.lng.toFixed(6)}`,
    )
  }
  return `${base}?${params.toString()}`
}

function ReportDocument({ data }: { data: ReportInput }) {
  const m = data.metrics
  const answerRate = m.callsReceived > 0 ? m.callsAnswered / m.callsReceived : 0
  const bookingConv = m.callsAnswered > 0 ? m.jobsBooked / m.callsAnswered : 0

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{data.reportTitle}</Text>
            <Text style={styles.headerSubtitle}>{data.businessName} · {data.periodLabel} · {data.serviceArea}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.headerBrand}>BellAveGo</Text>
            <Text style={styles.headerBrandSub}>AI Consulting</Text>
          </View>
        </View>

        <View style={styles.body}>

          {/* Stats row */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Your Numbers This Quarter</Text>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Calls Answered</Text>
                <Text style={styles.statValue}>{m.callsAnswered}</Text>
                <Text style={styles.statSub}>{fmtPct(answerRate)} answer rate</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Jobs Booked</Text>
                <Text style={styles.statValue}>{m.jobsBooked}</Text>
                <Text style={styles.statSub}>{fmtPct(bookingConv)} of answered calls</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Revenue Captured</Text>
                <Text style={styles.statValue}>{fmtUSD(m.totalRevenue)}</Text>
                <Text style={styles.statSub}>Avg job {fmtUSD(m.avgJobValue)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Peak Missed</Text>
                <Text style={[styles.statValue, { fontSize: 13, marginTop: 2 }]}>{m.peakUnansweredHour}</Text>
                <Text style={styles.statSub}>{m.topJobType} cluster</Text>
              </View>
            </View>
          </View>

          {/* BellAveGo Score */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>BellAveGo Score</Text>
            <View style={styles.scoreRow}>
              <View style={styles.scoreBox}>
                <Text style={styles.scoreLabel}>Composite</Text>
                <Text style={styles.scoreNumber}>{data.bellaveGoScore.composite.toFixed(1)}</Text>
                <Text style={styles.scoreOf}>out of 10</Text>
              </View>
              <View style={styles.scoreBreakdown}>
                {data.bellaveGoScore.breakdown.map((b) => (
                  <View key={b.label} style={styles.scoreRowItem}>
                    <Text style={styles.scoreRowLabel}>{b.label}</Text>
                    <View style={styles.scoreBar}>
                      <View style={[styles.scoreBarFill, { width: `${(b.value / b.max) * 100}%` }]} />
                    </View>
                    <Text style={styles.scoreRowValue}>{b.value.toFixed(1)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Local Market */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Local Market — {data.serviceArea}</Text>
            <View style={styles.marketRow}>
              <View style={styles.marketCard}>
                <Text style={styles.statLabel}>Competitors in your ZIP</Text>
                <Text style={styles.statValue}>{data.market.competitorCount}</Text>
                <Text style={styles.statSub}>You rank #{data.market.customerRank}</Text>
              </View>
              <View style={styles.marketCard}>
                <Text style={styles.statLabel}>Avg Competitor Rating</Text>
                <Text style={styles.statValue}>{data.market.avgCompetitorRating.toFixed(1)} ★</Text>
                <Text style={styles.statSub}>Across {data.market.competitorCount} businesses</Text>
              </View>
              <View style={[styles.marketCard, { flex: 2 }]}>
                <Text style={styles.statLabel}>Top 3 Competitors</Text>
                <View style={styles.competitorList}>
                  {data.market.topCompetitors.slice(0, 3).map((c) => (
                    <View key={c.name} style={styles.competitorItem}>
                      <Text style={styles.competitorName}>{c.name}</Text>
                      <Text style={styles.competitorRating}>{c.rating.toFixed(1)} ★ · {c.reviewCount} reviews</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>

          {/* Service Area Map — only when we have real lat/lng from Google Places */}
          {data.market.mapPoints && data.market.mapCenter && (
            <View style={styles.section} wrap={false}>
              <Text style={styles.sectionLabel}>Service Area · Your Business vs Competitors</Text>
              <Image
                src={buildStaticMapUrl(data.market.mapCenter, data.market.mapPoints)}
                style={styles.mapImage}
              />
              <View style={styles.mapLegend}>
                <View style={styles.mapLegendItem}>
                  <View style={[styles.mapLegendDot, { backgroundColor: TEAL }]} />
                  <Text style={styles.mapLegendText}>Y = your business</Text>
                </View>
                <View style={styles.mapLegendItem}>
                  <View style={[styles.mapLegendDot, { backgroundColor: AMBER }]} />
                  <Text style={styles.mapLegendText}>1–5 = top competitors by review count</Text>
                </View>
              </View>
            </View>
          )}

          {/* Opportunity */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>The Opportunity</Text>
            <View style={styles.opportunity}>
              <Text style={styles.opportunityHead}>{data.opportunity.headline}</Text>
              <Text style={styles.opportunityBody}>{data.opportunity.body}</Text>
              <Text style={styles.opportunityValue}>Estimated upside: {data.opportunity.estimatedValue}</Text>
            </View>
          </View>

          {/* Next quarter */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>What to Watch Next Quarter</Text>
            <Text style={{ fontSize: 9, color: SLATE, lineHeight: 1.5 }}>{data.nextQuarter}</Text>
          </View>

        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Generated for {data.generatedFor} · BellAveGo AI Consulting</Text>
          <Text style={styles.footerBrand}>bellavego.com</Text>
        </View>
      </Page>
    </Document>
  )
}

// ── Public render API ───────────────────────────────────────────
export async function generateReportPdf(data: ReportInput): Promise<Buffer> {
  const buffer = await renderToBuffer(<ReportDocument data={data} />)
  return buffer
}

// ── Sample data for sales demos ─────────────────────────────────
export const SAMPLE_REPORT: ReportInput = {
  businessName: 'Smith HVAC & Plumbing',
  reportTitle: 'Q2 2026 Performance Report',
  periodLabel: 'Feb 9 – May 9, 2026',
  generatedFor: 'Mike',
  serviceArea: 'metro Atlanta · 30309',
  metrics: {
    callsReceived: 184,
    callsAnswered: 167,
    jobsBooked: 89,
    jobsCompleted: 78,
    totalRevenue: 56_180,
    avgJobValue: 720,
    peakUnansweredHour: 'Tue 2–4 PM',
    topJobType: 'AC repair',
  },
  market: {
    competitorCount: 27,
    avgCompetitorRating: 4.2,
    topCompetitors: [
      { name: 'Estes Services', rating: 4.7, reviewCount: 1842 },
      { name: 'Coolray Heating & Air', rating: 4.6, reviewCount: 2103 },
      { name: 'Atlanta Plumbing Solutions', rating: 4.4, reviewCount: 318 },
    ],
    customerRank: 5,
  },
  bellaveGoScore: {
    composite: 7.4,
    breakdown: [
      { label: 'Answer rate', value: 9.1, max: 10 },
      { label: 'Booking conversion', value: 6.8, max: 10 },
      { label: 'Response time', value: 8.4, max: 10 },
      { label: 'Avg job value vs market', value: 5.9, max: 10 },
    ],
  },
  opportunity: {
    headline: 'Block 2–4 PM Tuesdays — your peak missed window.',
    body: 'You miss 23% of calls in the Tue 2–4 PM block, and 64% of those that DO get through book HVAC repair (your highest-margin job type, $720 avg). Adding one tech-on-call slot here would capture an estimated 8–12 jobs/quarter currently going to Estes and Coolray.',
    estimatedValue: '$3,200/mo additional revenue',
  },
  nextQuarter: 'Atlanta home-services search demand peaks mid-June (HVAC), late-October (heating), and mid-March (drain cleaning). Coolray launched a new financing offer in your ZIP last week — watch for price-sensitive callers asking about financing options. Your Google rating of 4.5 trails the local average; auto-review-request campaign launching with Growth tier this month should close that gap by August.',
}
