/**
 * Emma's call-opening line. Computed at call time from the contractor's
 * stored greeting style + business identity. Lives in its own module so
 * /api/vapi/assistant-request (and the setup-wizard preview) both render
 * the exact same string — no copy drift.
 *
 * Templates use the placeholders {business} and {owner}. Both fall back
 * to sensible defaults so a half-onboarded profile still produces a
 * usable greeting.
 */

export type GreetingStyle =
  | 'friendly_intro'
  | 'thanks_for_calling'
  | 'business_first'
  | 'custom'

export type GreetingInput = {
  businessName?: string | null
  ownerFirstName?: string | null
  aiName?: string | null
  style?: string | null
  customTemplate?: string | null
  language?: 'en' | 'es' | null
}

const TEMPLATES_EN: Record<Exclude<GreetingStyle, 'custom'>, string> = {
  friendly_intro: 'Hi, this is {ai} with {business}. {owner} is out on a job — how can I help?',
  thanks_for_calling: 'Thanks for calling {business}, this is {ai} — how can I help you today?',
  business_first: "Hi, you've reached {business}. {ai} speaking — what can I do for you?",
}

const TEMPLATES_ES: Record<Exclude<GreetingStyle, 'custom'>, string> = {
  friendly_intro: 'Hola, soy {ai} con {business}. {owner} está en un trabajo — ¿en qué le puedo ayudar?',
  thanks_for_calling: 'Gracias por llamar a {business}, soy {ai} — ¿en qué le puedo ayudar?',
  business_first: 'Hola, ha llamado a {business}. Habla {ai} — ¿en qué le puedo servir?',
}

function fillTemplate(template: string, business: string, owner: string, ai: string): string {
  return template
    .replace(/\{business\}/gi, business)
    .replace(/\{owner\}/gi, owner)
    .replace(/\{ai\}/gi, ai)
}

export function buildFirstMessage(input: GreetingInput): string {
  const business = input.businessName?.trim() || 'us'
  const owner = input.ownerFirstName?.trim() || 'The owner'
  const ai = input.aiName?.trim() || 'Emma'
  const lang = input.language === 'es' ? 'es' : 'en'

  const rawStyle = (input.style || 'friendly_intro') as GreetingStyle
  const style: GreetingStyle =
    rawStyle === 'friendly_intro' ||
    rawStyle === 'thanks_for_calling' ||
    rawStyle === 'business_first' ||
    rawStyle === 'custom'
      ? rawStyle
      : 'friendly_intro'

  if (style === 'custom' && input.customTemplate && input.customTemplate.trim()) {
    return fillTemplate(input.customTemplate.trim(), business, owner, ai)
  }

  const presets = lang === 'es' ? TEMPLATES_ES : TEMPLATES_EN
  const fallbackStyle: Exclude<GreetingStyle, 'custom'> =
    style === 'custom' ? 'friendly_intro' : style
  return fillTemplate(presets[fallbackStyle], business, owner, ai)
}

export const GREETING_STYLE_OPTIONS: Array<{
  value: Exclude<GreetingStyle, 'custom'>
  label: string
  previewExample: string
}> = [
  {
    value: 'friendly_intro',
    label: 'Friendly intro (recommended)',
    previewExample: "Hi, this is Emma with Mike's HVAC. Mike is out on a job — how can I help?",
  },
  {
    value: 'thanks_for_calling',
    label: 'Thanks for calling',
    previewExample: "Thanks for calling Mike's HVAC, this is Emma — how can I help you today?",
  },
  {
    value: 'business_first',
    label: 'Business-first',
    previewExample: "Hi, you've reached Mike's HVAC. Emma speaking — what can I do for you?",
  },
]
