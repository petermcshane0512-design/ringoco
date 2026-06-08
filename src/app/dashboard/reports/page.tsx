import { redirect } from 'next/navigation'

/**
 * 2026-06-07 — /dashboard/reports merged into /dashboard/leads.
 * Monthly report now lives as a section at the bottom of the leads page.
 * Old links still work via this redirect.
 */
export default function ReportsRedirect() {
  redirect('/dashboard/leads')
}

export const metadata = {
  robots: { index: false, follow: false },
}
