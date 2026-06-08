import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import CopyBlock from './CopyBlock'

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
              '"Most home-service guys miss 12 calls a month. That\'s 12 jobs in someone else\'s truck."',
              '[3-10s] Cut to phone screen.',
              '"My buddy Peter built BellAveGo. AI answers your missed calls. 24/7. Books the job. Texts you."',
              '[10-15s] Camera back on you.',
              `"Code ${code} in my bio. Try it 30 days, money-back."`,
            ]}
            caption={`Most of us miss 12 calls a month. That\'s 12 paychecks gone. My boy built an AI that answers every one of em + books the job + texts you. $297/mo flat. Code ${code} → ${refLink}\n\n#hvaclife #plumberlife #electricianlife #contractorlife #smallbusinessowner`}
          />

          <ReelScript
            length="30 sec · The Day-in-the-Life"
            script={[
              '[0-5s] You under a truck, on a job. Phone vibrates.',
              '"Phone\'s ringing again. Can\'t pick up — I\'m elbow deep."',
              '[5-15s] Cut to phone showing missed call → AI receptionist screen.',
              '"This is what I do now. AI named Emma picks up. Asks them what\'s broke. Books the appt. Texts me when."',
              '[15-25s] Cut to text message from Emma: "Booked: Smith, 3PM, AC tune-up, 5840 Elm St."',
              '"Job\'s on my calendar before I even crawl out from under this truck."',
              '[25-30s] Camera close, smile.',
              `"$297 a month. Code ${code} in bio. 30-day money-back."`,
            ]}
            caption={`Stopped picking up my phone on jobs. AI does it for me now. Books appts straight to my calendar while I work. Game changer for a 1-2 man crew. Code ${code} for 30-day money-back trial → ${refLink}\n\n#hvactech #plumber #1099life #smallbusinessowner`}
          />

          <ReelScript
            length="60 sec · The Story Sell"
            script={[
              '[0-10s] You at the truck, mid-job. Wipe sweat.',
              '"Real talk for solo guys + 2-3 man crews. Last summer I lost a $1,400 AC install because I couldn\'t pick up the phone — I was on a roof in Mesa."',
              '[10-25s] Pan to phone, show messy missed-calls list.',
              '"By Friday I had 8 missed calls. Probably 2-3 real jobs. Gone."',
              '[25-40s] Cut to screen recording — BellAveGo dashboard, Emma answering a test call.',
              '"This is BellAveGo. AI receptionist. Answers every call 24/7. Sounds like a person. Asks the right questions. Books the appt."',
              '"Plus it drops 5 fresh homeowner leads in your dashboard every Monday. People w/ broken systems in YOUR zip."',
              '[40-55s] Back to you, walking to next truck.',
              '"$297 a month. Flat. No setup. Cancel anytime. 30-day money-back if it doesn\'t pay for itself."',
              '[55-60s] Close-up.',
              `"Code ${code} in bio. Go look."`,
            ]}
            caption={`Lost a $1,400 install last summer because I couldn\'t pick up the phone. Don\'t be me. BellAveGo answers every call + books the appt + drops 5 fresh homeowner leads in your dashboard every Mon. Code ${code} → ${refLink}\n\n30-day money-back. $297/mo flat. For solo + 1-3 person crews.`}
          />

          <ReelScript
            length="15 sec · Quick Plug"
            script={[
              '[0-3s] You holding phone up showing missed-call list.',
              '"23 missed calls this week."',
              '[3-9s] Cut to text from Emma.',
              '"Now I get a text every time someone calls and books a job. AI does it. Bot named Emma."',
              '[9-15s] Camera on you.',
              `"$297 flat. Code ${code} in bio."`,
            ]}
            caption={`23 missed calls became 14 booked jobs since I started using BellAveGo. Code ${code} for trial → ${refLink}\n\n#hvac #plumber #electrician`}
          />

          <ReelScript
            length="30 sec · The Demo Call"
            script={[
              '[0-5s] You holding phone, screen visible.',
              '"Watch this. I\'m calling the BellAveGo demo line. See what Emma sounds like."',
              '[5-25s] Call (651) 467-7829. Let Emma answer + ask the booking questions live. Record the convo.',
              '[25-30s] Camera back on you.',
              `"That\'s my receptionist now. 24/7. $297 a month. Code ${code} for 30-day trial."`,
            ]}
            caption={`Called the BellAveGo demo line on camera. Listen to Emma (their AI) answer a service call like a real receptionist would. This is what handles my missed calls now. Code ${code} → ${refLink}`}
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
            Questions? Text Peter directly: (773) 710-9565
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
