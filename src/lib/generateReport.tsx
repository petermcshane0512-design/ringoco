/* eslint-disable jsx-a11y/alt-text */
import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer, Image } from '@react-pdf/renderer'
import type { ConsultingReport } from './consultingReport'

// ── Brand colors ────────────────────────────────────────────────
const TEAL = '#0AA89F'
const NAVY = '#0B1F3A'
const SLATE = '#4A7A80'
const MIST = '#7AAAB2'
const MIST_LIGHT = '#F5FDFB'
const GREEN = '#22C55E'
const AMBER = '#F59E0B'
const PAPER = '#FFFFFF'

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
    padding: '18 28',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 15, fontWeight: 'bold', color: PAPER, letterSpacing: -0.4 },
  headerSubtitle: { fontSize: 8.5, color: '#9CB7C0', marginTop: 3 },
  headerBrand: { fontSize: 10, color: TEAL, fontWeight: 'bold', letterSpacing: 1.5, textTransform: 'uppercase' },
  headerBrandSub: { fontSize: 7.5, color: '#7A8B95', marginTop: 2 },

  // Body container
  body: { padding: '18 28 56' },
  section: { marginBottom: 12 },
  sectionLabel: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: TEAL,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: NAVY, marginBottom: 6, letterSpacing: -0.2 },

  // Stat cards row
  statsRow: { flexDirection: 'row', gap: 6 },
  statCard: {
    flex: 1,
    backgroundColor: MIST_LIGHT,
    borderRadius: 6,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: TEAL,
  },
  statLabel: {
    fontSize: 6.5,
    color: MIST,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 3,
    fontWeight: 'bold',
  },
  statValue: { fontSize: 15, fontWeight: 'bold', color: NAVY, letterSpacing: -0.4 },
  statSub: { fontSize: 7, color: SLATE, marginTop: 2 },
  statDeltaUp: { fontSize: 7, color: GREEN, fontWeight: 'bold', marginTop: 2 },
  statDeltaDown: { fontSize: 7, color: '#DC2626', fontWeight: 'bold', marginTop: 2 },

  // Map
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
  scoreRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  scoreBox: {
    width: 90,
    backgroundColor: NAVY,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreLabel: { fontSize: 6.5, color: TEAL, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 'bold', marginBottom: 4 },
  scoreNumber: { fontSize: 30, fontWeight: 'bold', color: PAPER, lineHeight: 1 },
  scoreOf: { fontSize: 8, color: MIST, marginTop: 2 },
  scoreBreakdown: { flex: 1, justifyContent: 'space-between' },
  scoreRowItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  scoreRowLabel: { fontSize: 8, color: SLATE, width: 110 },
  scoreBar: { flex: 1, height: 5, backgroundColor: '#E6F0F2', borderRadius: 3, marginHorizontal: 8 },
  scoreBarFill: { height: 5, backgroundColor: TEAL, borderRadius: 3 },
  scoreRowValue: { fontSize: 8, color: NAVY, fontWeight: 'bold', width: 24, textAlign: 'right' },

  // Opportunities
  oppCard: {
    backgroundColor: MIST_LIGHT,
    borderRadius: 7,
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: GREEN,
  },
  oppHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 },
  oppRank: { fontSize: 9, fontWeight: 'bold', color: TEAL, marginRight: 6 },
  oppTitle: { fontSize: 10, fontWeight: 'bold', color: NAVY, flex: 1, letterSpacing: -0.1 },
  oppValue: { fontSize: 11, fontWeight: 'bold', color: GREEN },
  oppPattern: { fontSize: 7.5, color: SLATE, lineHeight: 1.5, marginBottom: 4 },
  oppAction: { fontSize: 7.5, color: NAVY, lineHeight: 1.5, fontWeight: 'bold' },
  oppConfidence: { fontSize: 6.5, color: MIST, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.8 },

  // Action plan
  actionRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E6F0F2',
    alignItems: 'flex-start',
  },
  actionPriority: {
    width: 18, height: 18, borderRadius: 4,
    backgroundColor: NAVY, color: PAPER,
    fontSize: 9, fontWeight: 'bold',
    textAlign: 'center',
    marginRight: 8,
    paddingTop: 3,
  },
  actionBody: { flex: 1 },
  actionTitle: { fontSize: 9, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  actionRationale: { fontSize: 7.5, color: SLATE, lineHeight: 1.4, marginBottom: 2 },
  actionMeta: { fontSize: 7, color: TEAL, fontWeight: 'bold' },

  // Generic table
  table: { width: '100%' },
  tableRow: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: '#E6F0F2' },
  tableHeader: { fontSize: 6.5, color: MIST, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.8 },
  tableCell: { fontSize: 8, color: NAVY },
  tableCellSlate: { fontSize: 8, color: SLATE },

  // Market scan tiles
  marketRow: { flexDirection: 'row', gap: 6 },
  marketCard: {
    flex: 1,
    backgroundColor: MIST_LIGHT,
    borderRadius: 6,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: AMBER,
  },

  // Executive summary
  execPara: { fontSize: 9, color: SLATE, lineHeight: 1.55, marginBottom: 5 },

  // Strengths/Gaps bullets
  bulletsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  bulletCol: { flex: 1 },
  bulletColTitle: { fontSize: 8, fontWeight: 'bold', color: NAVY, marginBottom: 4 },
  bulletItem: { flexDirection: 'row', marginBottom: 3 },
  bulletDot: { width: 12, fontSize: 8, color: TEAL },
  bulletText: { flex: 1, fontSize: 8, color: SLATE, lineHeight: 1.4 },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F5FDFB',
    padding: '8 28',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#D4E6DC',
  },
  footerText: { fontSize: 6.5, color: MIST },
  footerBrand: { fontSize: 7.5, color: TEAL, fontWeight: 'bold', letterSpacing: 0.8 },

  // Methodology
  methodology: {
    fontSize: 7,
    color: MIST,
    lineHeight: 1.5,
    fontStyle: 'italic',
    marginTop: 4,
  },
})

// ── Helpers ─────────────────────────────────────────────────────
function fmtUSD(n: number) {
  return '$' + Math.round(n).toLocaleString('en-US')
}
function fmtPct(n: number) {
  return Math.round(n * 100) + '%'
}
function fmtDelta(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${Math.round(n * 100)}% vs last period`
}

function buildStaticMapUrl(
  center: { lat: number; lng: number },
  points: Array<{ lat: number; lng: number; kind: 'business' | 'competitor' | 'opportunity'; label: string }>,
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

// ── Page header (shared across pages) ──────────────────────────
function ReportHeader({ data }: { data: ConsultingReport }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.headerTitle}>{data.meta.businessName} · {data.meta.period}</Text>
        <Text style={styles.headerSubtitle}>{data.meta.metroLabel} · Report #{data.meta.reportNumber}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.headerBrand}>BellAveGo</Text>
        <Text style={styles.headerBrandSub}>AI Consulting</Text>
      </View>
    </View>
  )
}

function ReportFooter({ data }: { data: ConsultingReport }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>Generated for {data.meta.ownerName} · {data.meta.generatedAt}</Text>
      <Text style={styles.footerBrand}>bellavego.com</Text>
    </View>
  )
}

// ── PDF document ────────────────────────────────────────────────
function ReportDocument({ data }: { data: ConsultingReport }) {
  const p = data.performance
  const market = data.competitive
  const census = data.marketScan

  // Filter map points to only those with real lat/lng
  const mapPointsWithCoords = data.serviceAreaMap.points
    .filter((p): p is typeof p & { lat: number; lng: number } => p.lat != null && p.lng != null)

  return (
    <Document>
      {/* ── PAGE 1: Performance · BellAveGo Score · Top 3 Opportunities ── */}
      <Page size="LETTER" style={styles.page}>
        <ReportHeader data={data} />

        <View style={styles.body}>

          {/* Executive Summary */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Executive Summary · TL;DR</Text>
            {data.executiveSummary.map((para, i) => (
              <Text key={i} style={styles.execPara}>{para}</Text>
            ))}
          </View>

          {/* Performance Stats */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Performance vs Last Period</Text>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Calls Answered</Text>
                <Text style={styles.statValue}>{p.callsAnswered}</Text>
                {p.callsAnsweredDelta !== 0 && (
                  <Text style={p.callsAnsweredDelta >= 0 ? styles.statDeltaUp : styles.statDeltaDown}>
                    {fmtDelta(p.callsAnsweredDelta)}
                  </Text>
                )}
                {p.callsAnsweredDelta === 0 && <Text style={styles.statSub}>{fmtPct(p.answerRate)} answer rate</Text>}
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Jobs Booked</Text>
                <Text style={styles.statValue}>{p.jobsBooked}</Text>
                {p.jobsBookedDelta !== 0
                  ? <Text style={p.jobsBookedDelta >= 0 ? styles.statDeltaUp : styles.statDeltaDown}>{fmtDelta(p.jobsBookedDelta)}</Text>
                  : <Text style={styles.statSub}>from {p.callsAnswered} answered</Text>}
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Revenue Booked</Text>
                <Text style={styles.statValue}>{fmtUSD(p.revenue)}</Text>
                {p.revenueDelta !== 0
                  ? <Text style={p.revenueDelta >= 0 ? styles.statDeltaUp : styles.statDeltaDown}>{fmtDelta(p.revenueDelta)}</Text>
                  : <Text style={styles.statSub}>Avg {fmtUSD(p.avgTicket)}</Text>}
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Avg Ticket</Text>
                <Text style={styles.statValue}>{fmtUSD(p.avgTicket)}</Text>
                {p.avgTicketDelta !== 0
                  ? <Text style={p.avgTicketDelta >= 0 ? styles.statDeltaUp : styles.statDeltaDown}>{fmtDelta(p.avgTicketDelta)}</Text>
                  : <Text style={styles.statSub}>per completed job</Text>}
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Saved After-Hours</Text>
                <Text style={styles.statValue}>{p.callsSaved}</Text>
                <Text style={styles.statSub}>calls outside 8-6 weekdays</Text>
              </View>
            </View>
          </View>

          {/* BellAveGo Score */}
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionLabel}>BellAveGo Score · Composite</Text>
            <View style={styles.scoreRow}>
              <View style={styles.scoreBox}>
                <Text style={styles.scoreLabel}>Composite</Text>
                <Text style={styles.scoreNumber}>{data.bellaveScore.composite.toFixed(1)}</Text>
                <Text style={styles.scoreOf}>out of 10</Text>
              </View>
              <View style={styles.scoreBreakdown}>
                {[
                  { label: 'Answer rate', value: data.bellaveScore.answerRate },
                  { label: 'Booking conversion', value: data.bellaveScore.bookingConversion },
                  { label: 'Response time', value: data.bellaveScore.responseTime },
                  { label: 'Pricing power', value: data.bellaveScore.pricingPower },
                ].map((b) => (
                  <View key={b.label} style={styles.scoreRowItem}>
                    <Text style={styles.scoreRowLabel}>{b.label}</Text>
                    <View style={styles.scoreBar}>
                      <View style={[styles.scoreBarFill, { width: `${(b.value / 10) * 100}%` }]} />
                    </View>
                    <Text style={styles.scoreRowValue}>{b.value.toFixed(1)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Top 3 Opportunities */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Top 3 Revenue Opportunities</Text>
            {data.opportunities.slice(0, 3).map((o) => (
              <View key={o.rank} style={styles.oppCard}>
                <View style={styles.oppHeader}>
                  <Text style={styles.oppRank}>#{o.rank}</Text>
                  <Text style={styles.oppTitle}>{o.title}</Text>
                  <Text style={styles.oppValue}>+{fmtUSD(o.monthlyValue)}/mo</Text>
                </View>
                <Text style={styles.oppPattern}>{o.pattern}</Text>
                <Text style={styles.oppAction}>→ {o.action}</Text>
                <Text style={styles.oppConfidence}>● {o.confidence} confidence</Text>
              </View>
            ))}
          </View>
        </View>

        <ReportFooter data={data} />
      </Page>

      {/* ── PAGE 2: Local Market · Service Area Map · Competitive Snapshot ── */}
      <Page size="LETTER" style={styles.page}>
        <ReportHeader data={data} />

        <View style={styles.body}>

          {/* Local Market Scan */}
          {census.homeownersInArea > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Local Market Scan · US Census ACS + Google Places</Text>
              <View style={styles.marketRow}>
                <View style={styles.marketCard}>
                  <Text style={styles.statLabel}>Homeowners</Text>
                  <Text style={styles.statValue}>{census.homeownersInArea.toLocaleString()}</Text>
                  <Text style={styles.statSub}>in your service area</Text>
                </View>
                <View style={styles.marketCard}>
                  <Text style={styles.statLabel}>Median Income</Text>
                  <Text style={styles.statValue}>{fmtUSD(census.medianIncome)}</Text>
                  <Text style={styles.statSub}>household</Text>
                </View>
                <View style={styles.marketCard}>
                  <Text style={styles.statLabel}>Median Home Age</Text>
                  <Text style={styles.statValue}>{census.medianHomeAge} yrs</Text>
                  <Text style={styles.statSub}>~{fmtPct(census.pctHvacOver15Yrs)} have aging HVAC</Text>
                </View>
                <View style={styles.marketCard}>
                  <Text style={styles.statLabel}>Addressable / Mo</Text>
                  <Text style={styles.statValue}>{fmtUSD(census.addressableRevenueMonthly)}</Text>
                  <Text style={styles.statSub}>est. local spend</Text>
                </View>
              </View>
              {census.seasonalSignal && (
                <Text style={[styles.execPara, { marginTop: 8 }]}>📅 {census.seasonalSignal}</Text>
              )}
            </View>
          )}

          {/* Service Area Map */}
          {mapPointsWithCoords.length > 0 && data.serviceAreaMap.points.find((p) => p.kind === 'business' && p.lat != null) && (
            <View style={styles.section} wrap={false}>
              <Text style={styles.sectionLabel}>Service Area · Your Business vs Top Competitors</Text>
              <Image
                src={buildStaticMapUrl(
                  { lat: mapPointsWithCoords[0].lat, lng: mapPointsWithCoords[0].lng },
                  mapPointsWithCoords.map((p) => ({ lat: p.lat, lng: p.lng, kind: p.kind, label: p.label })),
                )}
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

          {/* Competitive Snapshot */}
          {market.competitors.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Competitive Snapshot · Google Places</Text>
              <View style={styles.marketRow}>
                <View style={styles.marketCard}>
                  <Text style={styles.statLabel}>Your Rating</Text>
                  <Text style={styles.statValue}>{market.yourRating > 0 ? `★${market.yourRating.toFixed(1)}` : '—'}</Text>
                  <Text style={styles.statSub}>{market.yourReviewCount} reviews</Text>
                </View>
                <View style={styles.marketCard}>
                  <Text style={styles.statLabel}>Market Avg</Text>
                  <Text style={styles.statValue}>★{market.marketAvgRating.toFixed(1)}</Text>
                  <Text style={styles.statSub}>{market.marketAvgReviewCount} reviews avg</Text>
                </View>
                <View style={styles.marketCard}>
                  <Text style={styles.statLabel}>Your Rank</Text>
                  <Text style={styles.statValue}>#{market.yourRank || '—'}</Text>
                  <Text style={styles.statSub}>of {market.totalCompetitors || market.competitors.length + 1} in area</Text>
                </View>
              </View>
              <View style={[styles.table, { marginTop: 8 }]}>
                <View style={styles.tableRow}>
                  <Text style={[styles.tableHeader, { flex: 3 }]}>Competitor</Text>
                  <Text style={[styles.tableHeader, { flex: 1 }]}>Rating</Text>
                  <Text style={[styles.tableHeader, { flex: 1 }]}>Reviews</Text>
                  <Text style={[styles.tableHeader, { flex: 1 }]}>Distance</Text>
                </View>
                {market.competitors.slice(0, 5).map((c) => (
                  <View key={c.name} style={styles.tableRow}>
                    <Text style={[styles.tableCell, { flex: 3, fontWeight: 'bold' }]}>{c.name}</Text>
                    <Text style={[styles.tableCellSlate, { flex: 1 }]}>★{c.rating.toFixed(1)}</Text>
                    <Text style={[styles.tableCellSlate, { flex: 1 }]}>{c.reviewCount.toLocaleString()}</Text>
                    <Text style={[styles.tableCellSlate, { flex: 1 }]}>{c.distance}</Text>
                  </View>
                ))}
              </View>
              {/* Strengths + Gaps */}
              {(market.strengths.length > 0 || market.gaps.length > 0) && (
                <View style={styles.bulletsRow}>
                  <View style={styles.bulletCol}>
                    <Text style={styles.bulletColTitle}>✓ Your Strengths</Text>
                    {market.strengths.slice(0, 3).map((s, i) => (
                      <View key={i} style={styles.bulletItem}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>{s}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.bulletCol}>
                    <Text style={styles.bulletColTitle}>✗ Your Gaps</Text>
                    {market.gaps.slice(0, 3).map((g, i) => (
                      <View key={i} style={styles.bulletItem}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>{g}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        <ReportFooter data={data} />
      </Page>

      {/* ── PAGE 3: B2B Outreach · Upsells · 90-Day Action Plan · Methodology ── */}
      <Page size="LETTER" style={styles.page}>
        <ReportHeader data={data} />

        <View style={styles.body}>

          {/* B2B Outreach Targets */}
          {data.outreachTargets.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>B2B Outreach Targets · Commercial · TCPA-safe</Text>
              <Text style={[styles.statSub, { marginBottom: 6, color: SLATE }]}>
                Real businesses pulled from Google Places. Commercial properties only — legal to cold-call.
              </Text>
              <View style={styles.table}>
                <View style={styles.tableRow}>
                  <Text style={[styles.tableHeader, { flex: 2 }]}>Business</Text>
                  <Text style={[styles.tableHeader, { flex: 1.5 }]}>Type</Text>
                  <Text style={[styles.tableHeader, { flex: 1.2 }]}>Phone</Text>
                  <Text style={[styles.tableHeader, { flex: 3 }]}>Why</Text>
                </View>
                {data.outreachTargets.slice(0, 5).map((t) => (
                  <View key={t.business} style={styles.tableRow}>
                    <Text style={[styles.tableCell, { flex: 2, fontWeight: 'bold' }]}>{t.business}</Text>
                    <Text style={[styles.tableCellSlate, { flex: 1.5 }]}>{t.type}</Text>
                    <Text style={[styles.tableCell, { flex: 1.2, color: TEAL }]}>{t.phone}</Text>
                    <Text style={[styles.tableCellSlate, { flex: 3, lineHeight: 1.4 }]}>{t.why}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Recommended Upsells */}
          {data.upsells.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Recommended Priced Upsells</Text>
              <View style={styles.table}>
                <View style={styles.tableRow}>
                  <Text style={[styles.tableHeader, { flex: 2 }]}>Service</Text>
                  <Text style={[styles.tableHeader, { flex: 2.4 }]}>Demand signal</Text>
                  <Text style={[styles.tableHeader, { flex: 1, textAlign: 'right' }]}>Ticket</Text>
                  <Text style={[styles.tableHeader, { flex: 1, textAlign: 'right' }]}>Close</Text>
                  <Text style={[styles.tableHeader, { flex: 1.3, textAlign: 'right' }]}>Monthly</Text>
                </View>
                {data.upsells.slice(0, 5).map((u) => (
                  <View key={u.service} style={styles.tableRow}>
                    <Text style={[styles.tableCell, { flex: 2, fontWeight: 'bold' }]}>{u.service}</Text>
                    <Text style={[styles.tableCellSlate, { flex: 2.4 }]}>{u.demandSignal}</Text>
                    <Text style={[styles.tableCellSlate, { flex: 1, textAlign: 'right' }]}>{fmtUSD(u.avgTicket)}</Text>
                    <Text style={[styles.tableCellSlate, { flex: 1, textAlign: 'right' }]}>{fmtPct(u.closeRate)}</Text>
                    <Text style={[styles.tableCell, { flex: 1.3, textAlign: 'right', color: GREEN, fontWeight: 'bold' }]}>+{fmtUSD(u.monthlyOpportunity)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 90-Day Action Plan */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>90-Day Action Plan · Prioritized by Impact ÷ Effort</Text>
            {data.actionPlan.slice(0, 5).map((a) => (
              <View key={a.priority} style={styles.actionRow}>
                <Text style={styles.actionPriority}>{a.priority}</Text>
                <View style={styles.actionBody}>
                  <Text style={styles.actionTitle}>{a.title}</Text>
                  <Text style={styles.actionRationale}>{a.rationale}</Text>
                  <Text style={styles.actionMeta}>
                    → {a.expectedImpact} · {a.timeline} · {a.effort} effort
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Methodology */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Methodology</Text>
            <Text style={styles.methodology}>{data.methodology}</Text>
          </View>
        </View>

        <ReportFooter data={data} />
      </Page>
    </Document>
  )
}

// ── Public render API ───────────────────────────────────────────
export async function generateReportPdf(data: ConsultingReport): Promise<Buffer> {
  const buffer = await renderToBuffer(<ReportDocument data={data} />)
  return buffer
}
