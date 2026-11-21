import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('CA6: admins can delete an announcement after confirming; Live only hides it', () => {
  const api = read('../lib/admin/siteAnnouncements.ts')
  assert.match(api, /export async function deleteSiteAnnouncement\(id: string\)[\s\S]*?\/api\/admin\/site-announcements\/\$\{id\}`, \{ method: "DELETE" \}\)/)
  const hook = read('../hooks/useSiteAnnouncementsAdmin.ts')
  assert.match(hook, /window\.confirm\(`Delete "\$\{item\.name\}"\?/)
  assert.match(hook, /await deleteSiteAnnouncement\(item\._id\)/)
  const card = read('../components/admin/site-announcements/AnnouncementsCard.tsx')
  assert.match(card, /onClick=\{\(\) => onDelete\(item\)\}/)
  assert.match(read('../app/[ctx]/(pages)/admin/site-announcements/page.tsx'), /onDelete=\{deleteAnnouncement\}/)
})
