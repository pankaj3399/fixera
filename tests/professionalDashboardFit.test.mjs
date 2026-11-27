import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const PAGE = readFileSync(new URL('../app/[ctx]/(pages)/dashboard/page.tsx', import.meta.url), 'utf8')
const BENEFITS = readFileSync(new URL('../components/dashboard/BenefitsProgramCard.tsx', import.meta.url), 'utf8')
const pro = PAGE.slice(PAGE.indexOf('// Professional dashboard'), PAGE.indexOf('<TabsContent value="action_needed">', PAGE.indexOf('// Professional dashboard')))

test('FT2-9: the professional dashboard has no "Edit profile" quick action', () => {
  assert.doesNotMatch(pro, /quickActions\.editProfile/)
  assert.doesNotMatch(pro, /router\.push\('\/profile'\)/)
})

test('FT2-9: the benefits programme is compact and half width, next to favourites', () => {
  assert.match(pro, /<div className="mb-3 grid gap-3 lg:grid-cols-2">\s*<BenefitsProgramCard compact \/>\s*<FavoritesWidget/)
  // The compact card keeps level, points, next level and its requirements only.
  const compact = BENEFITS.slice(BENEFITS.indexOf('if (compact) {'), BENEFITS.indexOf('return (\n    <Card className={`bg-white/85'))
  assert.match(compact, /benefitsProgram\.currentLevel/)
  assert.match(compact, /benefitsProgram\.points/)
  assert.match(compact, /<Progress/)
  assert.doesNotMatch(compact, /benefitsProgram\.referral/)
  assert.doesNotMatch(compact, /benefitsProgram\.pointsExpiry/)
})

test('FT2-9: the empty gap at the top is reduced', () => {
  assert.match(pro, /max-w-6xl mx-auto pt-2"/)
  assert.doesNotMatch(pro, /max-w-6xl mx-auto pt-20/)
  assert.match(pro, /<h1 className="text-2xl font-bold/)
})
