import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import CopyBlock from './CopyBlock'
import { LEADS_PER_WEEK, LEADS_PER_MONTH, PRICE_PER_LEAD_USD } from '@/lib/offer'

export const metadata: Metadata = {
  title: 'Your BellAveGo Content Kit — Post & Earn $200/Ref',
  description: 'Done-for-you reel scripts, captions, and assets. Post one this week, start earning.',
  robots: { index: false, follow: false },  // unlisted, only via DM share
}

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Creator = {
  id: string
  handle: string | null
  personal_code: string | null
  paid_referrals_count: number | null
  lifetime_paid_cents: number | null
}

type Params = Promise<{ code: string }>

async function loadCreator(code: string): Promise<Creator | null> {
  const upper = code.toUpperCase()
  const { data } = await supabase
    .from('ig_creator_outreach')
    .select('id, handle, personal_code, paid_referrals_count, lifetime_paid_cents')
    .or(`personal_code.eq.${upper},personal_code.eq.${code}`)
    .limit(1)
    .maybeSingle()
  return data as Creator | null
}

export default async function AffiliateKitPage({ params }: { params: Params }) {
  const { code: codeRaw } = await params
  const code = (codeRaw || '').toUpperCase()
  const creator = await loadCreator(code)
  const refLink = `https://www.bellavego.com/ref/${code}`
  const handleDisplay = creator?.handle ? `@${creator.handle}` : 'creator'

  return (
    <main style={{
      fontFamily: "'Inter', system-ui, sans-serif",
      background: 'linear-gradient(180deg, #050E1F 0%, #0B1F3A 60%, #112C4A 100%)',
      color: '#fff',
      minHeight: '100vh',
    }}>
      <section style={{ padding: '48px 24px 28px', textAlign: 'center' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 14px', borderRadius: 99,
            background: 'rgba(232,116,43,0.10)',
            border: '1px solid rgba(232,116,43,0.30)',
            fontSize: 10.5, fontWeight: 800, color: '#FF9D5A',
            letterSpacing: '0.18em', textTransform: 'uppercase',
            marginBottom: 16,
          }}>🔥 Your Founding-100 Affiliate Kit</span>
          <h1 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.05, margin: '0 0 14px' }}>
            {handleDisplay} —{' '}
            <span style={{ background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 35%, #E8742B 70%, #C84B26 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              start earning today.
            </span>
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.72)', lineHeight: 1.55, maxWidth: 580, margin: '0 auto 22px' }}>
            Pick one reel below, hit record on your phone, post w/ the caption. Get $200 every time a home-service shop signs up through your link. Plus $1,000 bonus at 5 refs. Plus $3,000 at 15.
          </p>
        </div>
      </section>

      {/* Your code + link */}
      <section style={{ padding: '0 24px 32px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{
            padding: '20px 22px', borderRadius: 14,
            background: 'rgba(15,37,66,0.65)',
            border: '1px solid rgba(94,234,212,0.30)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 10 }}>
              Your code · Your link
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <CopyBlock label="Code" value={code} />
              <CopyBlock label="Link" value={refLink} />
            </div>
            {creator && (
              <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                Lifetime: <strong style={{ color: '#FFD9A8' }}>{creator.paid_referrals_count ?? 0} paid refs</strong> · ${(creator.lifetime_paid_cents ?? 0) / 100} earned
              </div>
            )}
          </div>
        </div>
      </section>

      {/* The 3-step instruction */}
      <section style={{ padding: '0 24px 36px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#5EEAD4', marginBottom: 14 }}>
            How this works
          </h2>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {[
              { n: 1, t: 'Pick a reel below', d: 'Hit record on your phone. Read the script.' },
              { n: 2, t: 'Post w/ caption', d: 'Caption already has your code. Just paste.' },
              { n: 3, t: 'Get paid every Friday', d: 'ACH direct deposit. $200 per signup. No cap.' },
            ].map((s) => (
              <div key={s.n} style={{ padding: 16, borderRadius: 12, background: 'rgba(15,37,66,0.50)', border: '1px solid rgba(94,234,212,0.18)' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#FF9D5A' }}>{s.n}</div>
                <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4 }}>{s.t}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reel scripts */}
      <section style={{ padding: '0 24px 36px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#5EEAD4', marginBottom: 14 }}>
            5 Done-for-you reel scripts
          </h2>

          <ReelScript
            length="15 sec · The Hook"
            script={[
              '[0-3s] Camera on you, hand on a tool/truck/job-site.',
              '"If you\'re not using AI to find customers, your competitors already are."',
              '[3-10s] Cut to phone showing dashboard w/ list of leads.',
              `"My buddy Peter built BellAveGo. ${LEADS_PER_WEEK} fresh homeowner leads every Monday, exclusive to your zip, delivered to your dashboard. They even auto-email + SMS them as YOU."`,
              '[10-15s] Camera back on you.',
              `"Code ${code} in my bio. 2 weeks free, cancel anytime."`,
            ]}
            caption={`If you\'re not using AI to find customers your competitors are. My boy built BellAveGo — ${LEADS_PER_MONTH} exclusive homeowner leads/mo in your zip + auto outreach as YOU. 2 weeks free w/ ${code} → ${refLink}\n\n#hvaclife #plumberlife #electricianlife #contractorlife #smallbusinessowner`}
          />

          <ReelScript
            length="30 sec · The Day-in-the-Life"
            script={[
              '[0-5s] You under a truck, on a job. Phone vibrates.',
              '"Used to be I\'d wake up Mondays w/ no jobs lined up. Hustle for hours just to find work."',
              `[5-15s] Cut to phone showing dashboard w/ ${LEADS_PER_WEEK} leads.`,
              `"Now I wake up Monday, open BellAveGo, see ${LEADS_PER_WEEK} fresh homeowners in my zip ready to call. Names, addresses, phones. Real public-record events."`,
              '[15-25s] Cut to text: "Mike from 7842 Oak St — yes please send a quote for AC".',
              '"The crazy part — BellAveGo emails + texts each one as ME. I only respond when they say yes."',
              '[25-30s] Camera close, smile.',
              `"2 weeks free, code ${code}. Cancel anytime."`,
            ]}
            caption={`Wake up Monday, ${LEADS_PER_WEEK} fresh homeowner leads in my zip — names, addresses, phones, pre-written scripts. AI emails them as me, I only respond when they say yes. Code ${code} for 2 weeks free → ${refLink}\n\n#hvactech #plumber #1099life #smallbusinessowner`}
          />

          <ReelScript
            length="60 sec · The Story Sell"
            script={[
              '[0-10s] You at the truck, mid-job. Wipe sweat.',
              '"Real talk for solo guys + 2-3 man crews. Last summer I burned 15 hrs/wk cold-calling random homeowners and HomeAdvisor leads that 4 other guys already had."',
              '[10-25s] Pan to phone, show old "leads" from competitors.',
              '"HomeAdvisor charged me $80/lead. Shared 5 ways. Bait. Never booked anything."',
              '[25-40s] Cut to BellAveGo dashboard.',
              `"This is BellAveGo. ${LEADS_PER_WEEK} homeowner leads/week (${LEADS_PER_MONTH}/mo) in my zip, EXCLUSIVE — never shared. Sourced from permits, aged units, property changes. Real intent."`,
              '"And it auto-emails + SMS\'s each lead as ME. Personalized. Sounds human. I just respond to the ones who say yes."',
              '[40-55s] Back to you, walking to next truck.',
              '"2 weeks free. Then $197 flat. Extra leads $25 each if I want more. Cancel anytime."',
              '[55-60s] Close-up.',
              `"Code ${code} in bio. Go look."`,
            ]}
            caption={`Stopped paying HomeAdvisor $80/lead for shared bait. BellAveGo gives me ${LEADS_PER_WEEK} EXCLUSIVE homeowner leads/wk (${LEADS_PER_MONTH}/mo) + auto-emails them as me. Code ${code} for 2 weeks free → ${refLink}\n\nCancel anytime. $197/mo flat after. For solo + 1-3 person crews.`}
          />

          <ReelScript
            length="15 sec · Quick Plug"
            script={[
              '[0-3s] You holding phone up showing dashboard w/ leads list.',
              `"${LEADS_PER_WEEK} fresh homeowner leads every Monday."`,
              '[3-9s] Cut to inbox: notification "Bill from 4421 Maple St replied — wants a quote".',
              '"All emailed automatically as me. I only respond when they\'re a yes."',
              '[9-15s] Camera on you.',
              `"2 weeks free w/ ${code} in bio."`,
            ]}
            caption={`${LEADS_PER_MONTH} exclusive homeowner leads this month + the AI emails them as me. Code ${code} → ${refLink}\n\n#hvac #plumber #electrician`}
          />

          <ReelScript
            length="30 sec · The Math"
            script={[
              '[0-5s] You holding phone, showing competitor pricing.',
              '"HomeAdvisor: $80/lead, shared 5 ways. Yelp leads: $60, shared. Networx: $45, shared."',
              '[5-15s] Cut to BellAveGo dashboard pricing.',
              `"BellAveGo: ${LEADS_PER_MONTH} leads/mo (${LEADS_PER_WEEK}/wk) for $197 = $${PRICE_PER_LEAD_USD.toFixed(2)}/lead. Exclusive. Never shared. They even reach out to em for you."`,
              '[15-25s] Show side-by-side math.',
              '"And $25/lead extra when I need more mid-week. Stupid cheap compared to anything else."',
              '[25-30s] Camera back on you.',
              `"2 weeks free. Code ${code}, cancel anytime."`,
            ]}
            caption={`Did the math on every lead-gen platform. BellAveGo destroys all of them — $${PRICE_PER_LEAD_USD.toFixed(2)}/lead exclusive vs $40-300/lead shared elsewhere. Code ${code} → ${refLink}`}
          />
        </div>
      </section>

      {/* Founder tutorial */}
      <section style={{ padding: '0 24px 48px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{
            padding: 22, borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(232,116,43,0.10) 0%, rgba(11,31,58,0.5) 100%)',
            border: '1px solid rgba(232,116,43,0.30)',
          }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#FF9D5A', marginBottom: 10 }}>
              90-sec founder tutorial (watch first)
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.55, margin: '0 0 14px' }}>
              Peter (founder) shows you exactly how to film a 30-sec reel about BellAveGo on your phone. No editing skills needed. Two takes.
            </p>
            <div style={{ padding: '14px 18px', borderRadius: 10, background: 'rgba(0,0,0,0.30)', border: '1px solid rgba(255,255,255,0.10)', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              📹 Tutorial video coming soon — recording this week. Until then, pick any reel script above. They\'re all under 60 sec.
            </div>
          </div>
        </div>
      </section>

      {/* Footer w/ link to leaderboard */}
      <section style={{ padding: '0 24px 64px', textAlign: 'center' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <Link href="/creators/leaderboard" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '11px 20px', borderRadius: 11,
            background: 'rgba(94,234,212,0.10)',
            border: '1px solid rgba(94,234,212,0.30)',
            color: '#5EEAD4',
            textDecoration: 'none',
            fontWeight: 800, fontSize: 13,
          }}>
            See live leaderboard →
          </Link>
          <div style={{ marginTop: 18, fontSize: 11, color: 'rgba(255,255,255,0.40)' }}>
            Questions? Text us: (773) 710-9565
          </div>
        </div>
      </section>
    </main>
  )
}

function ReelScript({ length, script, caption }: { length: string; script: string[]; caption: string }) {
  return (
    <div style={{
      marginBottom: 16,
      padding: 20, borderRadius: 14,
      background: 'rgba(15,37,66,0.55)',
      border: '1px solid rgba(94,234,212,0.18)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 12 }}>
        {length}
      </div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, marginBottom: 14, whiteSpace: 'pre-line' }}>
        {script.join('\n')}
      </div>
      <CopyBlock label="Caption" value={caption} multiline />
    </div>
  )
}
