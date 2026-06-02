/**
 * 50 US metros used by the programmatic /answering-service/[slug] pages.
 *
 * Heavy on Sun Belt + Rust Belt because that's where home-service
 * density + AI-receptionist ROI peaks. Each metro becomes 6 pages (one
 * per trade) = 300 total landing pages at scale.
 */
export const CITIES = [
  // ── SUN BELT ──
  { slug: 'phoenix-az', label: 'Phoenix', state: 'AZ', stateFull: 'Arizona' },
  { slug: 'tucson-az', label: 'Tucson', state: 'AZ', stateFull: 'Arizona' },
  { slug: 'mesa-az', label: 'Mesa', state: 'AZ', stateFull: 'Arizona' },
  { slug: 'las-vegas-nv', label: 'Las Vegas', state: 'NV', stateFull: 'Nevada' },
  { slug: 'henderson-nv', label: 'Henderson', state: 'NV', stateFull: 'Nevada' },
  { slug: 'houston-tx', label: 'Houston', state: 'TX', stateFull: 'Texas' },
  { slug: 'dallas-tx', label: 'Dallas', state: 'TX', stateFull: 'Texas' },
  { slug: 'fort-worth-tx', label: 'Fort Worth', state: 'TX', stateFull: 'Texas' },
  { slug: 'san-antonio-tx', label: 'San Antonio', state: 'TX', stateFull: 'Texas' },
  { slug: 'austin-tx', label: 'Austin', state: 'TX', stateFull: 'Texas' },
  { slug: 'tampa-fl', label: 'Tampa', state: 'FL', stateFull: 'Florida' },
  { slug: 'orlando-fl', label: 'Orlando', state: 'FL', stateFull: 'Florida' },
  { slug: 'miami-fl', label: 'Miami', state: 'FL', stateFull: 'Florida' },
  { slug: 'jacksonville-fl', label: 'Jacksonville', state: 'FL', stateFull: 'Florida' },
  { slug: 'atlanta-ga', label: 'Atlanta', state: 'GA', stateFull: 'Georgia' },
  { slug: 'charlotte-nc', label: 'Charlotte', state: 'NC', stateFull: 'North Carolina' },
  { slug: 'raleigh-nc', label: 'Raleigh', state: 'NC', stateFull: 'North Carolina' },
  { slug: 'nashville-tn', label: 'Nashville', state: 'TN', stateFull: 'Tennessee' },

  // ── RUST BELT + MIDWEST ──
  { slug: 'chicago-il', label: 'Chicago', state: 'IL', stateFull: 'Illinois' },
  { slug: 'naperville-il', label: 'Naperville', state: 'IL', stateFull: 'Illinois' },
  { slug: 'detroit-mi', label: 'Detroit', state: 'MI', stateFull: 'Michigan' },
  { slug: 'grand-rapids-mi', label: 'Grand Rapids', state: 'MI', stateFull: 'Michigan' },
  { slug: 'cleveland-oh', label: 'Cleveland', state: 'OH', stateFull: 'Ohio' },
  { slug: 'columbus-oh', label: 'Columbus', state: 'OH', stateFull: 'Ohio' },
  { slug: 'cincinnati-oh', label: 'Cincinnati', state: 'OH', stateFull: 'Ohio' },
  { slug: 'indianapolis-in', label: 'Indianapolis', state: 'IN', stateFull: 'Indiana' },
  { slug: 'kansas-city-mo', label: 'Kansas City', state: 'MO', stateFull: 'Missouri' },
  { slug: 'st-louis-mo', label: 'St. Louis', state: 'MO', stateFull: 'Missouri' },
  { slug: 'minneapolis-mn', label: 'Minneapolis', state: 'MN', stateFull: 'Minnesota' },
  { slug: 'milwaukee-wi', label: 'Milwaukee', state: 'WI', stateFull: 'Wisconsin' },

  // ── CALIFORNIA ──
  { slug: 'los-angeles-ca', label: 'Los Angeles', state: 'CA', stateFull: 'California' },
  { slug: 'san-diego-ca', label: 'San Diego', state: 'CA', stateFull: 'California' },
  { slug: 'sacramento-ca', label: 'Sacramento', state: 'CA', stateFull: 'California' },
  { slug: 'riverside-ca', label: 'Riverside', state: 'CA', stateFull: 'California' },
  { slug: 'bakersfield-ca', label: 'Bakersfield', state: 'CA', stateFull: 'California' },
  { slug: 'fresno-ca', label: 'Fresno', state: 'CA', stateFull: 'California' },

  // ── NORTHEAST ──
  { slug: 'philadelphia-pa', label: 'Philadelphia', state: 'PA', stateFull: 'Pennsylvania' },
  { slug: 'pittsburgh-pa', label: 'Pittsburgh', state: 'PA', stateFull: 'Pennsylvania' },
  { slug: 'newark-nj', label: 'Newark', state: 'NJ', stateFull: 'New Jersey' },
  { slug: 'cherry-hill-nj', label: 'Cherry Hill', state: 'NJ', stateFull: 'New Jersey' },
  { slug: 'long-island-ny', label: 'Long Island', state: 'NY', stateFull: 'New York' },
  { slug: 'westchester-ny', label: 'Westchester', state: 'NY', stateFull: 'New York' },
  { slug: 'boston-ma', label: 'Boston', state: 'MA', stateFull: 'Massachusetts' },
  { slug: 'worcester-ma', label: 'Worcester', state: 'MA', stateFull: 'Massachusetts' },

  // ── PACIFIC NW + MOUNTAIN ──
  { slug: 'seattle-wa', label: 'Seattle', state: 'WA', stateFull: 'Washington' },
  { slug: 'portland-or', label: 'Portland', state: 'OR', stateFull: 'Oregon' },
  { slug: 'salt-lake-city-ut', label: 'Salt Lake City', state: 'UT', stateFull: 'Utah' },
  { slug: 'denver-co', label: 'Denver', state: 'CO', stateFull: 'Colorado' },
  { slug: 'colorado-springs-co', label: 'Colorado Springs', state: 'CO', stateFull: 'Colorado' },

  // ── SOUTH ATLANTIC ──
  { slug: 'richmond-va', label: 'Richmond', state: 'VA', stateFull: 'Virginia' },
  { slug: 'virginia-beach-va', label: 'Virginia Beach', state: 'VA', stateFull: 'Virginia' },
] as const

export type CitySlug = (typeof CITIES)[number]['slug']

export function getCity(slug: string) {
  return CITIES.find((c) => c.slug === slug) ?? null
}
