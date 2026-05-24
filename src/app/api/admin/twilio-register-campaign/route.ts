import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/**
 * Register a 10DLC A2P campaign on the BellAveGo Platform messaging
 * service so SMS stops getting 30034-blocked. Brand is already
 * APPROVED (SOLE_PROPRIETOR). This adds the missing campaign layer.
 *
 * Campaign use_case: MIXED (transactional + low-volume marketing).
 * Sole-prop campaigns typically approve in under 10 minutes for low
 * volume. Cost: ~$2/month per campaign. Worth it — without it, every
 * outbound SMS is dropped.
 *
 * Auth: requireAdmin().
 */
const BRAND_SID = 'BN1d509bf3fc25472594e3a0a056db4040'
const MESSAGING_SERVICE_SID = 'MG75857e6be669188435e5ad61dca6a84d'

export async function POST() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return NextResponse.json({ error: 'Twilio creds missing' }, { status: 500 })
  }
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

  // Bail if a campaign already exists on this service.
  try {
    const existing = await client.messaging.v1
      .services(MESSAGING_SERVICE_SID)
      .usAppToPerson.list({ limit: 5 })
    if (existing.length > 0) {
      return NextResponse.json({
        skipped: true,
        reason: 'campaign already exists — no duplicate created',
        campaigns: existing.map((c) => ({
          sid: c.sid,
          status: c.campaignStatus,
          use_case: c.usAppToPersonUsecase,
        })),
      })
    }
  } catch (e) {
    return NextResponse.json(
      { error: `existing-campaign check failed: ${(e as Error).message}` },
      { status: 500 },
    )
  }

  try {
    const campaign = await client.messaging.v1
      .services(MESSAGING_SERVICE_SID)
      .usAppToPerson.create({
        brandRegistrationSid: BRAND_SID,
        description:
          'BellAveGo is an AI receptionist platform for home-service contractors. ' +
          'We send transactional notifications to small-business owners when their AI ' +
          'receptionist captures a callback request from a homeowner (lead alerts), ' +
          'and onboarding nudges during account setup. Recipients are the business ' +
          'owners themselves (not their customers); they opt in at signup by ' +
          'providing their cell during Stripe checkout.',
        messageSamples: [
          '🤖 BellAveGo for Mike\'s HVAC ⚡ New callback\n\n👤 Sarah\n📞 (555) 123-4567\n💬 AC not cooling\n⚡ Urgency: emergency\n\n📲 Tap to call: (555) 123-4567\n\nView at bellavego.com/dashboard',
          'Hey Mike — your BellAveGo AI hasn\'t received any calls yet. Usually means call forwarding isn\'t set up on your business cell. Reply HELP for the 60-second setup or visit bellavego.com/dashboard. Reply STOP to opt out.',
          '🎉 Mike — that was your FIRST BellAveGo call! Sarah just called your business line and Emma captured the lead. From now on, every missed call gets answered, captured, and texted to you in 20 seconds. — Peter, BellAveGo',
        ],
        usAppToPersonUsecase: 'MIXED',
        hasEmbeddedLinks: true,
        hasEmbeddedPhone: true,
        messageFlow:
          'Business owners (BellAveGo customers) opt in to receive these SMS messages during Stripe checkout when they enter their cell phone number to activate their AI receptionist account at bellavego.com/pricing. The phone-collection step explicitly states the cell will receive lead-alert SMS and account notifications.',
        optInMessage: 'You are now subscribed to BellAveGo lead alerts. Reply STOP to opt out.',
        optInKeywords: ['START'],
        optOutMessage: 'You have been unsubscribed from BellAveGo. No more messages will be sent. Reply START to resubscribe.',
        optOutKeywords: ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END'],
        helpMessage: 'BellAveGo AI Receptionist. For help, email peter@bellavego.com or visit bellavego.com. Reply STOP to opt out.',
        helpKeywords: ['HELP', 'INFO'],
      })

    return NextResponse.json({
      created: true,
      campaign: {
        sid: campaign.sid,
        status: campaign.campaignStatus,
        use_case: campaign.usAppToPersonUsecase,
        date_created: campaign.dateCreated,
      },
      note:
        'Sole-prop campaigns typically approve in under 10 minutes. Re-run ' +
        '/api/admin/twilio-a2p-status to check status. Once campaign_status is ' +
        'VERIFIED or APPROVED, SMS will stop 30034ing.',
    })
  } catch (e) {
    return NextResponse.json(
      { error: `campaign create failed: ${(e as Error).message}` },
      { status: 500 },
    )
  }
}
