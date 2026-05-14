import type { Metadata } from 'next'
import SampleReportClient from './client'
import { getEnrichedSampleReport } from '@/lib/sampleReportEnrich'

type SearchParams = Promise<{ for?: string; business?: string; zip?: string; type?: string; city?: string }>

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams
  const businessName = (sp.for || sp.business || '').trim()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.bellavego.com'

  if (!businessName) {
    return {
      title: 'BellAveGo Growth Report — Sample',
      description: 'See what BellAveGo Consulting delivers — every quarter, automatically, based on your real call and booking data.',
      openGraph: {
        title: 'BellAveGo Growth Report — Sample',
        description: 'See what BellAveGo Consulting delivers — automatically.',
        url: `${baseUrl}/sample-report`,
        siteName: 'BellAveGo',
        images: [`${baseUrl}/api/og/sample-report`],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: 'BellAveGo Growth Report — Sample',
        images: [`${baseUrl}/api/og/sample-report`],
      },
    }
  }

  const ogParams = new URLSearchParams({ for: businessName, ...(sp.zip && { zip: sp.zip }), ...(sp.type && { type: sp.type }) })
  const ogUrl = `${baseUrl}/api/og/sample-report?${ogParams.toString()}`

  return {
    title: `${businessName} — Growth Report by BellAveGo`,
    description: `AI-generated revenue analysis for ${businessName}. Three opportunities. Five-step action plan. Real local market data.`,
    openGraph: {
      title: `${businessName} — BellAveGo Growth Report`,
      description: `Three revenue opportunities and a 5-step action plan for ${businessName}, generated from real local market data.`,
      url: `${baseUrl}/sample-report?for=${encodeURIComponent(businessName)}`,
      siteName: 'BellAveGo',
      images: [ogUrl],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${businessName} — BellAveGo Growth Report`,
      description: `Three revenue opportunities and a 5-step action plan for ${businessName}.`,
      images: [ogUrl],
    },
  }
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  // Enrich the default sample with real Google Places competitor pins for
  // the configured demo area (St. Louis Park, MN). The "Y" pin is the
  // fictional demo business at the area centroid. Real prospect personalize
  // (?for=...) is handled client-side by the personalize API and is enriched
  // server-side inside that route.
  const initialReport = await getEnrichedSampleReport({
    prospectName: undefined,         // default sample = demo business, not real
    prospectZip: undefined,
    prospectType: undefined,
  }).catch(() => undefined)
  return <SampleReportClient initialReport={initialReport} initialSearchParams={sp} />
}
