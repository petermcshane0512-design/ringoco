/**
 * Recipe Lab — candidate BatchData property/search recipes per trade.
 *
 * Hard boundary: Terminal 1 owns fulfillment files (find-real-leads,
 * lead-engine, offer.ts, onboarding). This file is RESEARCH ONLY —
 * Terminal 1 reads these definitions later and wires the winning ones
 * into the production discovery path. Nothing here is imported by any
 * src/ code today.
 *
 * Each recipe = one BatchData searchCriteria object + confidence rating
 * + the reasoning behind every filter. Confidence is honest: if the
 * data BatchData exposes can't actually support a trade's signal, the
 * recipe says so and we don't pitch it.
 *
 * Climate adjustment (HVAC only): unit lifetime varies sharply by
 * climate. A 1995 Phoenix AC condenser has died and been replaced
 * three times; a 1995 Minneapolis furnace is on its first replacement
 * window. The single 1985-2005 window currently in production is
 * correct for mild-climate metros, wrong for hot metros.
 *
 * Cost: each probe call returns up to N results at $0.05/result.
 * Default take=15 = ~$0.75 per recipe×zip. Full sweep
 * (4 trades × ~6 recipes × 5 zips × 5 metros) ≈ $45. Run --dry-run first.
 *
 * --- JSDoc types (Terminal 1 reads these to know the shape) ---
 *
 * @typedef {'hot' | 'mild' | 'cold'} Climate
 * @typedef {'high' | 'medium' | 'low' | 'data-thin'} Confidence
 *
 * @typedef {Object} RecipeFilters
 * @property {number} [yearBuiltMin]
 * @property {number} [yearBuiltMax]
 * @property {boolean} [ownerOccupied]
 *
 * @typedef {Object} Recipe
 * @property {'hvac'|'roofing'|'plumbing'|'electrical'} trade
 * @property {string} slug
 * @property {string} label
 * @property {Confidence} confidence
 * @property {Climate|null} climate
 * @property {string} rationale
 * @property {RecipeFilters} filters
 * @property {string} [dataLimitations]
 *
 * @typedef {Object} MetroZips
 * @property {string} metro
 * @property {Climate} climate
 * @property {string[]} zips
 */

// Current year baseline for "age N years ago" math. Bump this annually.
const NOW = 2026

// ── HVAC ─────────────────────────────────────────────────────────────────
// Production recipe today is yearBuiltMin=1985, yearBuiltMax=2005.
// That window only makes sense for mild climates. Hot metros
// (Phoenix, Vegas, Houston) need a tighter, newer window because
// compressors die 10-15yr in 100°F+ heat; 1985-2005 homes already
// replaced once or twice. Cold metros (Minneapolis, Buffalo) get a
// wider window because furnaces last 18-25yr.
/** @type {Recipe[]} */
const HVAC_RECIPES = [
  {
    trade: 'hvac',
    slug: 'hvac-mild-baseline',
    label: 'HVAC mild climate (baseline — current production)',
    confidence: 'high',
    climate: 'mild',
    rationale:
      'Original units ~20-40yr old. Mild-climate compressors last 15-20yr; the 1985-2005 build window hits 21-41yr-old systems, deep into replacement territory.',
    filters: { yearBuiltMin: 1985, yearBuiltMax: 2005, ownerOccupied: true },
  },
  {
    trade: 'hvac',
    slug: 'hvac-hot-climate',
    label: 'HVAC hot climate (Phoenix / Vegas / Houston / Florida)',
    confidence: 'high',
    climate: 'hot',
    rationale:
      'AC compressors in 100°F+ sustained heat fail at 10-15yr. Targeting 11-18yr-old builds (2008-2015) catches first-replacement-cycle homeowners. Pre-2008 builds already replaced.',
    filters: { yearBuiltMin: 2008, yearBuiltMax: 2015, ownerOccupied: true },
  },
  {
    trade: 'hvac',
    slug: 'hvac-hot-climate-tight',
    label: 'HVAC hot climate — TIGHT window (highest intent)',
    confidence: 'high',
    climate: 'hot',
    rationale:
      'Narrowed to 12-15yr-old builds (2011-2014) — first AC replacement statistically due NOW. Lower volume, higher per-lead intent.',
    filters: { yearBuiltMin: 2011, yearBuiltMax: 2014, ownerOccupied: true },
  },
  {
    trade: 'hvac',
    slug: 'hvac-cold-climate',
    label: 'HVAC cold climate (Minneapolis / Buffalo / Chicago N)',
    confidence: 'medium',
    climate: 'cold',
    rationale:
      'Gas furnaces last 18-25yr in cold climates. 1990-2008 window targets first-replacement homeowners. Wider window because furnace failures cluster across a longer band than AC.',
    filters: { yearBuiltMin: 1990, yearBuiltMax: 2008, ownerOccupied: true },
    dataLimitations:
      'BatchData does not expose heating-system type. Cannot distinguish gas furnace (target) from heat-pump or boiler. Filter purely on build year.',
  },
]

// ── ROOFING ──────────────────────────────────────────────────────────────
/** @type {Recipe[]} */
const ROOFING_RECIPES = [
  {
    trade: 'roofing',
    slug: 'roofing-asphalt-3tab',
    label: 'Roofing — 3-tab asphalt replacement window',
    confidence: 'high',
    climate: null,
    rationale: `3-tab asphalt shingles 15-20yr life. Targeting homes built ${NOW - 25}-${NOW - 15} (15-25yr-old roofs assuming original).`,
    filters: { yearBuiltMin: NOW - 25, yearBuiltMax: NOW - 15, ownerOccupied: true },
    dataLimitations:
      'BatchData does not expose roof material or last-roof-permit date. Filter is age-only; some homes re-roofed already (no signal to filter out).',
  },
  {
    trade: 'roofing',
    slug: 'roofing-architectural',
    label: 'Roofing — architectural shingle replacement window',
    confidence: 'medium',
    climate: null,
    rationale: `Architectural / dimensional shingles 25-30yr life. Targeting homes built ${NOW - 30}-${NOW - 25}.`,
    filters: { yearBuiltMin: NOW - 30, yearBuiltMax: NOW - 25, ownerOccupied: true },
  },
  {
    trade: 'roofing',
    slug: 'roofing-broad-overlay-storm',
    label: 'Roofing — broad age window for NOAA storm overlay join',
    confidence: 'high',
    climate: null,
    rationale:
      'Any home 10-35yr old + recent hail strike (joined from scrape-noaa-storms) = high-intent insurance-funded replacement. BatchData supplies the pool; storm overlay qualifies.',
    filters: { yearBuiltMin: NOW - 35, yearBuiltMax: NOW - 10, ownerOccupied: true },
    dataLimitations:
      'Assumes Terminal 1 joins against noaa_storm_events at find-real-leads. Standalone fill rate high (broad window) but unqualified.',
  },
]

// ── PLUMBING ─────────────────────────────────────────────────────────────
/** @type {Recipe[]} */
const PLUMBING_RECIPES = [
  {
    trade: 'plumbing',
    slug: 'plumbing-galvanized',
    label: 'Plumbing — galvanized supply line replacement',
    confidence: 'high',
    climate: null,
    rationale:
      'Galvanized supply lines installed pre-1970 corrode 40-60yr after install. Pre-1970 home that has NOT been re-piped = on borrowed time.',
    filters: { yearBuiltMin: 1900, yearBuiltMax: 1969, ownerOccupied: true },
    dataLimitations: 'No way to filter out homes already re-piped. Expect some noise.',
  },
  {
    trade: 'plumbing',
    slug: 'plumbing-polybutylene',
    label: 'Plumbing — polybutylene (Cox v. Shell class) replacement',
    confidence: 'high',
    climate: null,
    rationale:
      'Polybutylene supply line installed 1978-1995. Class-action settled, brittle/leaking. Mass-replacement market.',
    filters: { yearBuiltMin: 1978, yearBuiltMax: 1995, ownerOccupied: true },
  },
  {
    trade: 'plumbing',
    slug: 'plumbing-cast-iron-sewer',
    label: 'Plumbing — cast-iron sewer / drain replacement',
    confidence: 'medium',
    climate: null,
    rationale:
      'Cast-iron drain stack pre-1980 — corrosion + scale → recurring backups, sewer-line replacement.',
    filters: { yearBuiltMin: 1900, yearBuiltMax: 1980, ownerOccupied: true },
    dataLimitations: 'Overlaps galvanized recipe — dedupe required at orchestrator layer.',
  },
  {
    trade: 'plumbing',
    slug: 'plumbing-water-heater-PLACEHOLDER',
    label: 'Plumbing — water-heater replacement (DATA GAP)',
    confidence: 'data-thin',
    climate: null,
    rationale:
      'Water heaters fail 8-12yr after install. BatchData property/search does NOT expose water-heater install-year. Recipe cannot exist without partner data (utility-rebate registry, manufacturer warranty DB, or city permit feed). DO NOT pitch a water-heater-age recipe until a real data source backs it.',
    filters: {},
    dataLimitations: 'Recipe empty by design. Skip until data source acquired.',
  },
]

// ── ELECTRICAL ───────────────────────────────────────────────────────────
/** @type {Recipe[]} */
const ELECTRICAL_RECIPES = [
  {
    trade: 'electrical',
    slug: 'electrical-pre-1980-panel',
    label: 'Electrical — pre-1980 panel + service upgrade',
    confidence: 'medium',
    climate: null,
    rationale:
      'Pre-1980 builds disproportionately have 60-100A panels (target: 200A modern). Insurance carriers refuse renewal on aluminum or Federal Pacific panels. Replacement market real but signal indirect — filter by build year only.',
    filters: { yearBuiltMin: 1900, yearBuiltMax: 1980, ownerOccupied: true },
    dataLimitations:
      'BatchData has no panel-brand / panel-amperage / wiring-material data. Pre-1980 window is proxy, not guarantee.',
  },
  {
    trade: 'electrical',
    slug: 'electrical-fpe-aluminum-window',
    label: 'Electrical — FPE / aluminum-wiring high-risk era',
    confidence: 'low',
    climate: null,
    rationale:
      'Federal Pacific Stab-Lok panels + aluminum branch wiring installed 1965-1975. Recipe is build-window proxy. Lower confidence than broader pre-1980 cut. Recommend dropping.',
    filters: { yearBuiltMin: 1965, yearBuiltMax: 1975, ownerOccupied: true },
    dataLimitations:
      'Same as above — purely a build-year proxy. Consider DROPPING and standardizing on pre-1980-panel recipe instead.',
  },
  {
    trade: 'electrical',
    slug: 'electrical-ev-charger-PLACEHOLDER',
    label: 'Electrical — EV charger installation (DATA GAP)',
    confidence: 'data-thin',
    climate: null,
    rationale:
      'EV charger installs are driven by recent vehicle purchase + permit pull, not home age. BatchData has neither. Belongs in permit-scraper layer joined against EV-registration data, not BatchData. Marked here so gap is visible.',
    filters: {},
    dataLimitations: 'Skip until joined data path exists. Do not include in BatchData probe sweep.',
  },
]

/** @type {Recipe[]} */
export const RECIPES = [
  ...HVAC_RECIPES,
  ...ROOFING_RECIPES,
  ...PLUMBING_RECIPES,
  ...ELECTRICAL_RECIPES,
]

// ── Test zips per metro ──────────────────────────────────────────────────
// Five zips per metro, spread across density brackets. Phoenix + Chicago
// are the two HVAC climate-stress comparators.
/** @type {MetroZips[]} */
export const TEST_METROS = [
  {
    metro: 'Phoenix AZ (hot — AC compressor stress)',
    climate: 'hot',
    zips: ['85015', '85013', '85008', '85020', '85003'],
  },
  {
    metro: 'Chicago IL (cold — furnace replacement)',
    climate: 'cold',
    zips: ['60615', '60625', '60647', '60611', '60660'],
  },
  {
    metro: 'Houston TX (hot — also hurricane roofing)',
    climate: 'hot',
    zips: ['77002', '77005', '77019', '77024', '77098'],
  },
  {
    metro: 'Tampa FL (hot + tropical storms)',
    climate: 'hot',
    zips: ['33602', '33606', '33611', '33629', '33647'],
  },
  {
    metro: 'Austin TX (mild — baseline for HVAC)',
    climate: 'mild',
    zips: ['78704', '78703', '78745', '78751', '78757'],
  },
]
