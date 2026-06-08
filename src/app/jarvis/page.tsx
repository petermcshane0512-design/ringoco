import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'

/**
 * /jarvis — Peter's personal shortcut to the nucleus dashboard.
 *
 * Behavior:
 *   - Not signed in → /sign-in?redirect_url=/admin/founder
 *   - Signed in     → 307 to /admin/founder (admin gate enforced there)
 *
 * Why /jarvis (not /founder) — /founder is already the public bio page.
 * Peter calls me Jarvis per his memory entries, so this URL is his
 * muscle-memory backdoor: bellavego.com/jarvis → instant nucleus.
 *
 * No admin gate at THIS layer on purpose — keeps the URL clean to type
 * from any device. The real auth happens at /admin/founder + its data
 * API where requireAdmin() runs. Non-admins who hit /jarvis will land
 * on the sign-in screen, sign up if needed, then hit /admin/founder
 * which 403s them with a clean "Forbidden" inside the canvas.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function JarvisShortcut() {
  const { userId } = await auth()
  if (!userId) {
    redirect('/sign-in?redirect_url=%2Fadmin%2Ffounder')
  }
  redirect('/admin/founder')
}
