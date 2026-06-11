import { redirect } from 'next/navigation'

/**
 * /dashboard — RETIRED 2026-06-10 per Peter ("there can't be confusion
 * after someone does the onboarding process").
 *
 * The old 1,024-line root dashboard was the receptionist-era Monday
 * brief. Worse: when a fresh tenant had no data yet it rendered
 * SAMPLE_WEEK — fabricated leads shown to real paying customers, a
 * straight violation of the no-invented-numbers rule.
 *
 * Algorithm step 2: there is exactly ONE surface a lead-gen customer
 * needs after onboarding — their leads. Everything else (settings,
 * buy-more, support) hangs off the command bar on that page.
 *
 * Old component preserved in git history (commit 6236e5a and earlier)
 * if a multi-page dashboard ever earns its way back.
 */
export default function DashboardRedirect() {
  redirect('/dashboard/leads')
}
