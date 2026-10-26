/**
 * Deterministic browser regression checks for admin account anonymization.
 *
 * This is intentionally outside `node --test` because it needs a running Next
 * server and a browser. It uses request interception only; it never calls a
 * real backend, database, S3, email, Stripe or Odoo endpoint.
 *
 * Run:
 *   PORT=3100 npm run dev
 *   BROWSER_BASE_URL=http://localhost:3100 \
 *   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
 *   CHROMIUM_PATH=/path/to/chrome \
 *   node tests/browser/adminAnonymize.browser.mjs
 *
 * If Playwright or the dev server is unavailable the script prints a NOT RUN
 * notice and exits with code 2. A skipped run is not a passing run.
 */

import { readFileSync } from "node:fs"

const BASE = process.env.BROWSER_BASE_URL || "http://localhost:3100"
const BACKEND = process.env.BROWSER_BACKEND_URL || "http://localhost:4000"
const PLAYWRIGHT_MODULE = process.env.PLAYWRIGHT_MODULE || "playwright"
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || ""

const wireFixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/adminAnonymize/wire/${name}.json`, import.meta.url), "utf8"))

let chromium
try {
  const playwrightModule = await import(PLAYWRIGHT_MODULE)
  chromium = playwrightModule.chromium
} catch {
  console.log(`NOT RUN (skip): Playwright is not available (${PLAYWRIGHT_MODULE}).`)
  process.exit(2)
}

try {
  const response = await fetch(BASE, { redirect: "manual" })
  if (!response) throw new Error("no response")
} catch {
  console.log(`NOT RUN (skip): no dev server at ${BASE}. Start it with PORT=3100 npm run dev.`)
  process.exit(2)
}

const results = []
function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`)
}

function json(route, status, body) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
}

const admin = {
  _id: "665f1f77bcf86cd799439000",
  name: "Super Admin",
  email: "super@example.com",
  role: "admin",
  adminRole: "super",
  adminPermissions: ["users.delete", "customers.manage", "professionals.approve", "professionals.manage", "support.tickets", "chat.support"],
  adminAccessLevels: {
    user_delete: "write",
    customers: "write",
    professionals_approve: "write",
    professionals_manage: "write",
    support: "write",
    chat: "write",
  },
  isEmailVerified: true,
  isPhoneVerified: true,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
}

const ids = {
  normal: "665f1f77bcf86cd799439011",
  anon: "665f1f77bcf86cd799439012",
  uncertain: "665f1f77bcf86cd799439013",
  recovery: "665f1f77bcf86cd799439014",
  alreadyPending: "665f1f77bcf86cd799439015",
  legacy: "665f1f77bcf86cd799439016",
  professional: "665f1f77bcf86cd799439021",
  normalProfessional: "665f1f77bcf86cd799439022",
}

const baseImpact = {
  bookings: { total: 1, active: 0, asCustomer: 1, asProfessional: 0 },
  payments: { total: 1, invoiceRecords: 1, pendingObligations: 0 },
  refunds: { total: 0, pending: 0 },
  disputes: { total: 0, active: 0 },
  warrantyClaims: { total: 0, active: 0 },
  cancellationRequests: { total: 0, active: 0 },
  supportTickets: 0,
  chatMessages: 0,
  meetings: 0,
  projects: 0,
  marketingSubscribers: 0,
  notifications: 0,
  emailLogs: 0,
}
const baseCleanup = { pendingFiles: 0, pendingCalendarReleases: 0, deletedFiles: 0, failedFiles: 0, completedAt: null, lastError: null }
const pendingCleanup = { pendingFiles: 1, pendingCalendarReleases: 1, deletedFiles: 0, failedFiles: 1, completedAt: null, lastError: "One owned file could not be deleted." }
const retained = [{ category: "bookings", label: "Booking and service facts", reason: "Kept for contract history." }]

function previewFor(userId) {
  const target = {
    id: userId,
    role: "customer",
    name: userId === ids.uncertain ? "Uma Uncertain" : "Ada Customer",
    email: userId === ids.uncertain ? "uma@example.com" : "ada@example.com",
    accountStatus: "active",
    professionalStatus: null,
    deletedAt: null,
    isAnonymized: false,
    accessDisabled: false,
    needsRedaction: true,
  }
  const base = {
    target,
    status: "eligible",
    eligible: true,
    alreadyAnonymized: false,
    recoveryRequired: false,
    fullyAnonymized: false,
    blockers: [],
    impact: baseImpact,
    retained,
    cleanup: baseCleanup,
    confirmation: { requiredText: "ANONYMIZE" },
    warnings: ["External provider records are not changed by this endpoint."],
  }
  if (userId === ids.recovery) {
    return {
      ...base,
      target: { ...target, name: null, email: null, deletedAt: "2026-10-20T10:00:00.000Z", isAnonymized: true, identityRemoved: false, accessDisabled: true, needsRedaction: true },
      status: "recovery_required",
      eligible: true,
      recoveryRequired: true,
      cleanup: pendingCleanup,
    }
  }
  if (userId === ids.alreadyPending) {
    return {
      ...base,
      target: { ...target, name: null, email: null, accountStatus: "rejected", deletedAt: "2026-10-20T10:00:00.000Z", isAnonymized: true, identityRemoved: true, accessDisabled: true, needsRedaction: false },
      status: "already_anonymized",
      eligible: false,
      alreadyAnonymized: true,
      cleanup: pendingCleanup,
    }
  }
  if (userId === ids.legacy) {
    return {
      ...base,
      target: { ...target, name: null, email: null, accountStatus: "rejected", deletedAt: "2025-01-01T10:00:00.000Z", isAnonymized: true, identityRemoved: true, legacyAnonymized: true, accessDisabled: true, needsRedaction: false },
      status: "recovery_required",
      eligible: true,
      recoveryRequired: true,
      cleanup: pendingCleanup,
    }
  }
  return base
}

function serverRecoveryAccount(targetId = ids.alreadyPending, overrides = {}) {
  return {
    targetId,
    role: "customer",
    state: "partial_cleanup",
    isAnonymized: true,
    accessDisabled: true,
    identityRemoved: true,
    legacyAnonymized: false,
    needsRedaction: false,
    deletedAt: "2026-10-26T12:00:00.000Z",
    anonymizedAt: "2026-10-26T12:00:00.000Z",
    startedAt: "2026-10-26T12:00:00.000Z",
    completedAt: null,
    pendingFiles: 1,
    pendingCalendarReleases: 1,
    lastError: "One owned file could not be deleted.",
    previewPath: `/api/admin/users/${targetId}/anonymize/preview`,
    ...overrides,
  }
}

const partialResult = {
  outcome: "partially_completed",
  fullyAnonymized: false,
  target: { id: ids.normal, role: "customer", deletedAt: "2026-10-26T12:00:00.000Z", isAnonymized: true, anonymizedAt: "2026-10-26T12:00:00.000Z" },
  redacted: { profile: true, supportTickets: 0, chatMessages: 0, meetings: 0, bookingRecords: 1, projects: 0, marketingSubscribers: 0, notifications: 0, emailLogs: 0, s3Objects: 1 },
  cleanup: pendingCleanup,
  warnings: ["1 stored file still needs deletion. Repeat the confirmed request to retry them."],
}

function customerRows() {
  return [
    { _id: ids.normal, name: "Ada Customer", email: "ada@example.com", loyaltyLevel: "Gold", points: 10, moneySpent: 100, accountStatus: "active", location: { country: "BE" } },
    { _id: ids.anon, name: "[deleted user]", email: `deleted-${ids.anon}@anon.local`, loyaltyLevel: "Bronze", points: 0, moneySpent: 50, accountStatus: "rejected", location: { country: "BE" }, isAnonymized: true },
    { _id: ids.uncertain, name: "Uma Uncertain", email: "uma@example.com", loyaltyLevel: "Bronze", points: 0, moneySpent: 50, accountStatus: "active", location: { country: "BE" } },
    { _id: ids.recovery, name: "Recovery Needed", email: "recovery@example.com", loyaltyLevel: "Bronze", points: 0, moneySpent: 50, accountStatus: "active", location: { country: "BE" } },
    { _id: ids.alreadyPending, name: "Already Pending", email: "already-pending@example.com", loyaltyLevel: "Bronze", points: 0, moneySpent: 50, accountStatus: "active", location: { country: "BE" } },
    { _id: ids.legacy, name: "Legacy Row", email: "legacy@example.com", loyaltyLevel: "Bronze", points: 0, moneySpent: 50, accountStatus: "active", location: { country: "BE" } },
  ]
}

async function newPage({ role = "super", viewport = { width: 1280, height: 900 } } = {}) {
  const state = {
    role,
    mode: "partial",
    previewCalls: [],
    executeCalls: [],
    executed: new Set(),
    quoteCalls: 0,
    recoveryCalls: 0,
    recoveryMode: "ok",
    recoveryPage: null,
    recoveryTotal: null,
    recoveryTotalPages: null,
    recoveryLimit: null,
    recoveryPages: null,
    recoveryPageErrors: new Set(),
    serverRecovery: [],
  }
  const context = await chromium.launch({ headless: true, ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}) }).then(async (browser) => {
    const context = await browser.newContext({ viewport })
    await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }])
    context.__browser = browser
    return context
  })
  const page = await context.newPage()
  await page.route(`${BACKEND}/**`, async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const method = route.request().method()
    if (path === "/api/auth/me") {
      const low = {
        ...admin,
        _id: "665f1f77bcf86cd799439001",
        adminRole: "care",
        adminPermissions: ["customers.manage"],
        adminAccessLevels: { customers: "write", user_delete: "none" },
      }
      return json(route, 200, { success: true, user: state.role === "low" ? low : admin })
    }
    if (path === "/api/admin/customers/manage" && method === "GET") {
      return json(route, 200, { success: true, data: { customers: customerRows().filter((row) => !state.executed.has(row._id)) } })
    }
    if (path === "/api/admin/professionals/manage" && method === "GET") {
      return json(route, 200, {
        success: true,
        data: {
          professionals: [{
            _id: ids.professional,
            name: "[deleted user]",
            email: `deleted-${ids.professional}@anon.local`,
            phone: "DELETED",
            professionalStatus: "approved",
            isAnonymized: true,
            deletedAt: "2026-10-20T10:00:00.000Z",
            professionalLevel: "New",
            points: 0,
            moneyEarned: 500,
            accountStatus: "rejected",
            adminTags: ["verified"],
            businessInfo: { companyName: "Old Company", country: "BE" },
            createdAt: "2025-01-01T00:00:00.000Z",
          }, {
            _id: ids.normalProfessional,
            name: "Nora Normal",
            email: "nora@example.com",
            phone: "+32 470 00 00 00",
            professionalStatus: "approved",
            isAnonymized: false,
            deletedAt: null,
            professionalLevel: "Level 1",
            points: 12,
            moneyEarned: 300,
            accountStatus: "active",
            adminTags: ["verified"],
            businessInfo: { companyName: "Live Company", country: "BE" },
            createdAt: "2025-01-01T00:00:00.000Z",
          }],
        },
      })
    }
    if (path === "/api/admin/professionals" && method === "GET") {
      return json(route, 200, {
        success: true,
        data: {
          professionals: [
            {
              _id: ids.professional,
              name: "[deleted user]",
              email: `deleted-${ids.professional}@anon.local`,
              phone: "DELETED",
              username: "old-company-username",
              vatNumber: "BE-OLD-VAT",
              professionalStatus: "approved",
              isAnonymized: true,
              deletedAt: "2026-10-20T10:00:00.000Z",
              businessInfo: { companyName: "Old Company", city: "Old City", country: "BE", website: "https://old.example.com" },
              pendingIdChanges: [{ field: "legalName", oldValue: "Old Legal Name", newValue: "New Legal Name" }],
              serviceCategories: ["Old Service"],
            },
            {
              _id: ids.normalProfessional,
              name: "Nora Normal",
              email: "nora@example.com",
              phone: "+32 470 00 00 00",
              username: "live-username",
              vatNumber: "BE-LIVE-VAT",
              professionalStatus: "approved",
              isAnonymized: false,
              deletedAt: null,
              businessInfo: { companyName: "Live Company", city: "Brussels", country: "BE", website: "https://live.example.com" },
              serviceCategories: ["Live Service"],
            },
          ],
        },
      })
    }
    if (path === "/api/admin/users/anonymization/recovery") {
      state.recoveryCalls += 1
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1)
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 100))
      state.recoveryPage = String(page)
      state.recoveryLimit = String(limit)
      if (state.recoveryMode === "error") {
        return json(route, 500, { success: false, code: "INTERNAL", msg: "Failed to load recoverable anonymizations" })
      }
      if (state.recoveryMode === "hang") {
        // Leave the request pending until the page's own bounded timeout aborts it.
        return new Promise(() => {})
      }
      if (state.recoveryPageErrors.has(page)) {
        return json(route, 500, { success: false, code: "INTERNAL", msg: "Failed to load recoverable anonymizations" })
      }
      const allRecovery = state.recoveryPages
        ? Object.values(state.recoveryPages).flat()
        : state.serverRecovery
      const accounts = state.recoveryPages
        ? (state.recoveryPages[page] ?? [])
        : state.serverRecovery.slice((page - 1) * limit, page * limit)
      const total = state.recoveryTotal ?? allRecovery.length
      const totalPages = state.recoveryTotalPages ?? Math.max(1, Math.ceil(total / limit))
      return json(route, 200, {
        success: true,
        data: {
          accounts,
          total,
          page,
          limit,
          totalPages,
          counts: {
            partialCleanup: allRecovery.filter((account) => account.state === "partial_cleanup").length,
            recoveryInProgress: allRecovery.filter((account) => account.state === "recovery_in_progress").length,
            recoveryRequired: allRecovery.filter((account) => account.state === "recovery_required").length,
          },
        },
      })
    }
    const previewMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/anonymize\/preview$/)
    if (previewMatch) {
      state.previewCalls.push(previewMatch[1])
      if (state.mode === "gateway-after" && previewMatch[1] === ids.uncertain) {
        return json(route, 200, {
          success: true,
          data: {
            ...previewFor(ids.uncertain),
            target: { ...previewFor(ids.uncertain).target, name: null, email: null, accountStatus: "rejected", deletedAt: "2026-10-26T12:00:00.000Z", isAnonymized: true, identityRemoved: true, accessDisabled: true, needsRedaction: false },
            status: "already_anonymized",
            eligible: false,
            alreadyAnonymized: true,
            fullyAnonymized: true,
          },
        })
      }
      if (state.mode === "incomplete-after" && previewMatch[1] === ids.uncertain) {
        return json(route, 200, {
          success: true,
          data: {
            ...previewFor(ids.uncertain),
            target: { ...previewFor(ids.uncertain).target, name: null, email: null, deletedAt: "2026-10-26T12:00:00.000Z", isAnonymized: true, identityRemoved: false, accessDisabled: true, needsRedaction: true },
            status: "recovery_required",
            eligible: true,
            recoveryRequired: true,
            cleanup: pendingCleanup,
          },
        })
      }
      if (state.mode === "inprogress-after" && previewMatch[1] === ids.uncertain) {
        return json(route, 200, {
          success: true,
          data: {
            ...previewFor(ids.uncertain),
            status: "blocked",
            eligible: false,
            blockers: [{ code: "ANONYMIZATION_IN_PROGRESS", message: "Another anonymization request currently owns this account." }],
          },
        })
      }
      if (state.mode === "blocked-after" && previewMatch[1] === ids.uncertain) {
        return json(route, 200, {
          success: true,
          data: {
            ...previewFor(ids.uncertain),
            status: "blocked",
            eligible: false,
            blockers: [{ code: "ACTIVE_BOOKINGS", message: "2 bookings still have an active lifecycle state.", count: 2 }],
          },
        })
      }
      return json(route, 200, { success: true, data: previewFor(previewMatch[1]) })
    }
    const executeMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/anonymize$/)
    if (executeMatch) {
      const id = executeMatch[1]
      state.executeCalls.push({ id, body: route.request().postDataJSON() })
      if (state.mode === "gateway" && id === ids.uncertain) {
        return json(route, 504, {})
      }
      if (state.mode === "incomplete" && id === ids.uncertain) {
        return json(route, 500, {
          success: false,
          msg: "The account is tombstoned, but database redaction did not complete.",
          code: "ANONYMIZE_INCOMPLETE",
          data: { targetId: id, tombstoned: true, fullyAnonymized: false, retryable: true, previewPath: `/api/admin/users/${id}/anonymize/preview` },
        })
      }
      if (state.mode === "inprogress" && id === ids.uncertain) {
        return json(route, 409, {
          success: false,
          msg: "Another anonymization request currently owns this account.",
          code: "ANONYMIZATION_IN_PROGRESS",
          data: { retryAfterSeconds: 5 },
        })
      }
      if (state.mode === "blocked" && id === ids.uncertain) {
        return json(route, 409, {
          success: false,
          msg: "Anonymization is blocked by active records.",
          code: "ANONYMIZE_BLOCKED",
          blockers: [{ code: "ACTIVE_BOOKINGS", message: "2 bookings still have an active lifecycle state.", count: 2 }],
          data: { blockers: [{ code: "ACTIVE_BOOKINGS", message: "2 bookings still have an active lifecycle state.", count: 2 }] },
        })
      }
      state.executed.add(id)
      return json(route, 200, { success: true, data: { ...partialResult, target: { ...partialResult.target, id } } })
    }
    return json(route, 200, { success: true, data: {} })
  })
  return { context, page, state }
}

async function openCustomers(page) {
  await page.goto(`${BASE}/admin/customers`, { waitUntil: "networkidle" })
  await page.waitForTimeout(700)
}

async function openDialog(page, name) {
  const card = page.locator("div").filter({ hasText: name }).filter({ has: page.getByRole("button", { name: "Anonymize" }) }).last()
  await card.getByRole("button", { name: "Anonymize" }).click()
  await page.getByRole("heading", { name: "Anonymize account" }).waitFor()
}

async function closeDialog(page) {
  const done = page.getByRole("button", { name: "Done" })
  if (await done.count()) await done.click()
  else await page.getByRole("button", { name: "Cancel" }).click()
  await page.waitForTimeout(350)
}

async function resetScenario(page, state) {
  await page.evaluate(() => sessionStorage.clear())
  state.executed.clear()
  state.previewCalls.length = 0
  state.executeCalls.length = 0
  state.mode = "partial"
  state.recoveryCalls = 0
  state.recoveryMode = "ok"
  state.recoveryPage = null
  state.recoveryTotal = null
  state.recoveryTotalPages = null
  state.recoveryLimit = null
  state.recoveryPages = null
  state.recoveryPageErrors.clear()
  state.serverRecovery = []
  await openCustomers(page)
}

async function runAdminChecks() {
  const { context, page, state } = await newPage()
  await openCustomers(page)

  const anonCard = page.locator("div").filter({ hasText: "Deleted user" }).filter({ has: page.getByText("Personal details are no longer available.") }).last()
  check("anonymized customer row hides mutating controls", await anonCard.getByRole("button", { name: "Anonymize" }).count() === 0)
  check("anonymized customer row hides permanent delete", await anonCard.getByRole("button", { name: "Delete permanently" }).count() === 0)
  check("anonymized customer row hides chat", await anonCard.getByRole("button", { name: "Chat" }).count() === 0)
  check("anonymized customer row keeps financial facts", (await anonCard.innerText()).includes("EUR 50"))
  const anonCardText = await anonCard.innerText()
  check("anonymized customer row hides the stored country", !anonCardText.includes("BE"), anonCardText)
  const normalCard = page.locator("div").filter({ hasText: "Ada Customer" }).filter({ has: page.getByRole("button", { name: "Anonymize" }) }).last()
  check("a normal customer row keeps its country", (await normalCard.innerText()).includes("BE"))

  await openDialog(page, "Ada Customer")
  check("dialog title receives initial focus", await page.evaluate(() => document.activeElement?.textContent?.includes("Anonymize account")))
  const input = page.locator('input[autocomplete="off"]')
  await input.fill("anonymize")
  check("lowercase confirmation is rejected", (await page.locator("body").innerText()).includes("Type ANONYMIZE exactly to confirm."))
  await input.press("Enter")
  await page.waitForTimeout(250)
  check("Enter does not execute", state.executeCalls.length === 0)
  await input.fill("ANONYMIZE")
  await page.getByRole("button", { name: "Anonymize account" }).last().click()
  await page.waitForTimeout(700)
  check("one click sends exactly one PUT", state.executeCalls.length === 1)
  check("PUT body is exact", JSON.stringify(state.executeCalls[0]?.body) === JSON.stringify({ confirm: "ANONYMIZE" }))
  const resultText = await page.locator("body").innerText()
  check("partial result is truthful", resultText.includes("Identity removed, but cleanup is incomplete"))
  check("partial result offers cleanup retry", resultText.includes("Retry cleanup"))
  check("partial result does not claim full success", !resultText.includes("Personal data has been removed from active use and every login path is blocked"))
  await closeDialog(page)
  check("row is removed after partial", !(await page.locator("body").innerText()).includes("Ada Customer"))
  check("recovery card survives", (await page.locator("body").innerText()).includes("Cleanup still pending for an anonymized customer account"))
  check("focus leaves BODY after row removal", await page.evaluate(() => document.activeElement?.tagName !== "BODY"), await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName))
  const storageText = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(sessionStorage))))
  check("session recovery record has no old identity", !/Ada Customer|ada@example\.com|old-avatar|avatar/.test(storageText))
  check("session recovery record is admin scoped", storageText.includes("fixera-admin-anonymize-recovery:v2:665f1f77bcf86cd799439000:customers"))

  await resetScenario(page, state)
  await openDialog(page, "Recovery Needed")
  const recoveryText = await page.locator("body").innerText()
  check("recovery_required does not claim identity removed", recoveryText.includes("Cleanup needs recovery") && !recoveryText.includes("identity is already removed"))
  await closeDialog(page)
  const recoveryCard = await page.locator("body").innerText()
  check("recovery_required card says redaction is not proven complete", recoveryCard.includes("Recovery still pending for a locked customer account") && (recoveryCard.includes("Identity redaction is still required") || recoveryCard.includes("identity redaction is not proven complete")))
  check("recovery_required card does not claim identity removed", !recoveryCard.includes("identity has already been removed"))
  const recoveryStorage = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(sessionStorage))))
  check("recovery_required storage has no old identity", !/Recovery Needed|recovery@example\.com/.test(recoveryStorage))

  await resetScenario(page, state)
  await openDialog(page, "Already Pending")
  const alreadyDialogText = await page.locator("body").innerText()
  check("already pending dialog names existing redaction", alreadyDialogText.includes("Already anonymized"))
  check("already pending dialog uses past-tense redaction copy", alreadyDialogText.includes("This account is already anonymized") && alreadyDialogText.includes("were already removed from active use") && !alreadyDialogText.includes("This cannot be undone"))
  await closeDialog(page)
  const alreadyCard = await page.locator("body").innerText()
  check("already pending card says identity already removed", alreadyCard.includes("Cleanup still pending for an anonymized customer account") && alreadyCard.includes("identity has already been removed"))
  const alreadyStorage = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(sessionStorage))))
  check("already pending storage has no old identity", !/Already Pending|already-pending@example\.com/.test(alreadyStorage))

  await resetScenario(page, state)
  await openDialog(page, "Legacy Row")
  await closeDialog(page)
  const legacyCard = await page.locator("body").innerText()
  check("legacy recovery names older flow", legacyCard.includes("previously redacted customer account") && legacyCard.includes("older flow"))

  await resetScenario(page, state)
  state.mode = "gateway"
  await openDialog(page, "Uma Uncertain")
  const input2 = page.locator('input[autocomplete="off"]')
  await input2.fill("ANONYMIZE")
  await page.getByRole("button", { name: "Anonymize account" }).last().click()
  await page.waitForTimeout(700)
  const ambiguousText = await page.locator("body").innerText()
  check("504 is treated as ambiguous", ambiguousText.includes("Check account status"))
  check("504 does not auto-retry", state.executeCalls.length === 1)
  check("close is available after ambiguous result", await page.getByRole("button", { name: "Cancel" }).isEnabled())
  check("execute stays disabled until status check", await page.getByRole("button", { name: "Anonymize account" }).last().isDisabled())
  await page.getByRole("button", { name: "Cancel" }).click()
  await page.waitForTimeout(450)
  check("unknown outcome keeps a recovery card", (await page.locator("body").innerText()).includes("outcome needs a status check"))
  const unknownStorage = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(sessionStorage))))
  check("unknown recovery record is status_unknown", unknownStorage.includes("status_unknown"))

  state.recoveryMode = "error"
  state.recoveryCalls = 0
  await page.reload({ waitUntil: "networkidle" })
  await page.waitForTimeout(900)
  const localFallbackText = await page.locator("body").innerText()
  check("an unavailable server list preserves a useful local recovery entry", localFallbackText.includes("outcome needs a status check"))
  check("an unavailable server list is labelled as session-only", localFallbackText.includes("entries below come from this browser session only"))
  check("an unavailable server list does not auto-execute", state.executeCalls.length === 1)
  state.recoveryMode = "ok"
  state.recoveryCalls = 0
  await page.getByRole("button", { name: "Retry loading" }).click()
  await page.waitForTimeout(500)
  check("retrying a failed list does not discard the local unknown outcome", (await page.locator("body").innerText()).includes("outcome needs a status check"))
  check("a successful list retry clears the unavailable notice", !(await page.locator("body").innerText()).includes("server recovery list could not be loaded"))

  state.mode = "gateway-after"
  await page.getByRole("button", { name: "Check status and resume" }).click()
  await page.getByRole("heading", { name: "Anonymize account" }).waitFor()
  await page.waitForTimeout(600)
  check("status check shows already anonymized", (await page.locator("body").innerText()).includes("Already anonymized"))
  check("status check makes no second PUT", state.executeCalls.length === 1)
  await closeDialog(page)
  check("status check removes the recovery card", !(await page.locator("body").innerText()).includes("outcome needs a status check"))

  await resetScenario(page, state)
  state.mode = "incomplete"
  await openDialog(page, "Uma Uncertain")
  const input3 = page.locator('input[autocomplete="off"]')
  await input3.fill("ANONYMIZE")
  await page.getByRole("button", { name: "Anonymize account" }).last().click()
  await page.waitForTimeout(700)
  const incompleteText = await page.locator("body").innerText()
  check("ANONYMIZE_INCOMPLETE requires a status check", incompleteText.includes("Check account status"))
  check("ANONYMIZE_INCOMPLETE sends one PUT", state.executeCalls.length === 1)
  await page.getByRole("button", { name: "Cancel" }).click()
  await page.waitForTimeout(450)
  check("ANONYMIZE_INCOMPLETE keeps a recovery card", (await page.locator("body").innerText()).includes("Recovery still pending for a locked customer account"))
  state.mode = "incomplete-after"
  await page.getByRole("button", { name: "Check status and resume" }).click()
  await page.getByRole("heading", { name: "Anonymize account" }).waitFor()
  await page.waitForTimeout(600)
  const recoveredText = await page.locator("body").innerText()
  check("recovery preview names the confirmed retry", recoveredText.includes("Cleanup needs recovery") && recoveredText.includes("Retry anonymization"))
  check("recovery preview does not auto-execute", state.executeCalls.length === 1)
  await closeDialog(page)

  await resetScenario(page, state)
  state.mode = "inprogress"
  await openDialog(page, "Uma Uncertain")
  const input4 = page.locator('input[autocomplete="off"]')
  await input4.fill("ANONYMIZE")
  await page.getByRole("button", { name: "Anonymize account" }).last().click()
  await page.waitForTimeout(700)
  check("in-progress requires a status check", (await page.locator("body").innerText()).includes("Check account status"))
  check("in-progress sends one PUT", state.executeCalls.length === 1)
  await page.getByRole("button", { name: "Cancel" }).click()
  await page.waitForTimeout(450)
  state.mode = "inprogress-after"
  await page.getByRole("button", { name: "Check status and resume" }).click()
  await page.getByRole("heading", { name: "Anonymize account" }).waitFor()
  await page.waitForTimeout(600)
  const inProgressText = await page.locator("body").innerText()
  check("in-progress preview shows the blocker", inProgressText.includes("Anonymization blocked") && inProgressText.includes("Another anonymization request currently owns this account."))
  check("in-progress preview cannot force retry", await page.getByRole("button", { name: "Anonymize account" }).last().isDisabled())
  check("in-progress makes no second PUT", state.executeCalls.length === 1)
  await closeDialog(page)

  await resetScenario(page, state)
  state.mode = "blocked"
  await openDialog(page, "Uma Uncertain")
  const input5 = page.locator('input[autocomplete="off"]')
  await input5.fill("ANONYMIZE")
  await page.getByRole("button", { name: "Anonymize account" }).last().click()
  await page.waitForTimeout(700)
  const blockedText = await page.locator("body").innerText()
  check("blocked execute shows blockers", blockedText.includes("Anonymization blocked") && blockedText.includes("2 bookings still have an active lifecycle state."))
  check("blocked execute cannot retry", await page.getByRole("button", { name: "Anonymize account" }).last().isDisabled())
  check("blocked execute makes no second PUT", state.executeCalls.length === 1)
  await closeDialog(page)

  await resetScenario(page, state)
  state.recoveryTotal = 1
  state.serverRecovery = [serverRecoveryAccount()]
  await page.evaluate(() => sessionStorage.clear())
  await openCustomers(page)
  const serverRecoveryText = await page.locator("body").innerText()
  check("server recovery list is discoverable without session storage", serverRecoveryText.includes("Cleanup still pending for an anonymized customer account"))
  check("server recovery list is loaded from the permission-gated route", state.recoveryCalls >= 1)
  await page.getByRole("button", { name: "Check status and resume" }).click()
  await page.getByRole("heading", { name: "Anonymize account" }).waitFor()
  await page.waitForTimeout(600)
  check("server recovery resume opens the authoritative preview", (await page.locator("body").innerText()).includes("Already anonymized"))
  await closeDialog(page)

  state.role = "low"
  await resetScenario(page, state)
  check("low permission sees no Anonymize", await page.getByRole("button", { name: "Anonymize" }).count() === 0)
  check("low permission sees no Delete permanently", await page.getByRole("button", { name: "Delete permanently" }).count() === 0)
  check("low permission makes no preview call", state.previewCalls.length === 0)
  check("low permission makes no execute call", state.executeCalls.length === 0)
  check("low permission makes no recovery-list call", state.recoveryCalls === 0)

  await context.__browser.close()
}

async function runRecoveryFailureChecks() {
  const { context, page, state } = await newPage()
  const recoveryRegion = page.getByRole("region", { name: "Pending anonymization cleanup" })

  await page.goto(BASE, { waitUntil: "domcontentloaded" })
  await page.evaluate(() => sessionStorage.clear())
  state.recoveryMode = "error"
  await page.goto(`${BASE}/admin/customers`, { waitUntil: "networkidle" })
  await page.waitForTimeout(900)
  check("recovery 500 with empty storage renders a status section", await recoveryRegion.count() === 1)
  const failedText = await recoveryRegion.innerText().catch(() => "")
  check("recovery 500 says the server list could not be loaded", failedText.includes("server recovery list could not be loaded"))
  check("recovery 500 offers an explicit GET retry", await recoveryRegion.getByRole("button", { name: "Retry loading" }).count() === 1)
  check("recovery 500 does not look like a successful empty list", !failedText.includes("Cleanup still pending for an anonymized"))
  check("recovery list requests page 1 with the 100 cap", state.recoveryPage === "1" && state.recoveryLimit === "100")

  state.recoveryMode = "ok"
  state.recoveryTotal = 1
  state.serverRecovery = [serverRecoveryAccount()]
  const callsBeforeRetry = state.recoveryCalls
  await recoveryRegion.getByRole("button", { name: "Retry loading" }).click()
  await page.getByText("Cleanup still pending for an anonymized customer account").waitFor()
  await page.waitForTimeout(300)
  const retriedText = await recoveryRegion.innerText()
  check("recovery GET retry success shows the server account", retriedText.includes("Cleanup still pending for an anonymized customer account"))
  check("recovery GET retry success clears the unavailable notice", !retriedText.includes("could not be loaded"))
  check("recovery GET retry sends exactly one new request", state.recoveryCalls === callsBeforeRetry + 1)

  await page.evaluate(() => sessionStorage.clear())
  state.serverRecovery = []
  state.recoveryTotal = 0
  state.recoveryCalls = 0
  await page.goto(`${BASE}/admin/customers`, { waitUntil: "networkidle" })
  await page.waitForTimeout(900)
  check("a successful empty recovery list renders no section", await recoveryRegion.count() === 0)
  check("a successful empty recovery list is not shown as an error", !(await page.locator("body").innerText()).includes("server recovery list could not be loaded"))
  check("a successful empty recovery list still made one request", state.recoveryCalls === 1)

  await page.evaluate((key) => {
    sessionStorage.clear()
    sessionStorage.setItem(key, JSON.stringify([{
      targetId: "665f1f77bcf86cd799439099",
      role: "visitor",
      state: "recovery_required",
      identityRemoved: false,
      cleanup: { pendingFiles: 1, pendingCalendarReleases: 0, deletedFiles: 0, failedFiles: 1, completedAt: null, lastError: null },
      source: "session",
    }]))
  }, "fixera-admin-anonymize-recovery:v2:665f1f77bcf86cd799439000:customers")
  state.recoveryPages = {
    1: [
      serverRecoveryAccount(ids.alreadyPending),
      serverRecoveryAccount(ids.recovery, {
        role: "professional",
        state: "recovery_required",
        isAnonymized: false,
        identityRemoved: false,
        legacyAnonymized: false,
        needsRedaction: true,
        pendingFiles: 0,
      }),
    ],
    2: [
      serverRecoveryAccount(ids.legacy, {
        state: "recovery_required",
        isAnonymized: false,
        identityRemoved: true,
        legacyAnonymized: true,
        needsRedaction: false,
      }),
    ],
    3: [serverRecoveryAccount("665f1f77bcf86cd799439098")],
  }
  state.recoveryTotal = 4
  state.recoveryTotalPages = 3
  state.recoveryCalls = 0
  await page.goto(`${BASE}/admin/customers`, { waitUntil: "networkidle" })
  await page.waitForTimeout(900)
  const pagedText = await recoveryRegion.innerText()
  check("a paged server list states how many accounts are shown", pagedText.includes("Showing 2 of 4 accounts"))
  check("a paged server list keeps a useful local pending entry", pagedText.includes("locked visitor account"))
  check("a bare tombstone is listed as still needing redaction", pagedText.includes("Identity redaction is still required"))
  check("a paged server list offers load more", await recoveryRegion.getByRole("button", { name: "Load more" }).count() === 1)
  state.recoveryPageErrors.add(2)
  await recoveryRegion.getByRole("button", { name: "Load more" }).click()
  await page.getByText(/The next recovery page could not be loaded/).waitFor()
  check("a failed load-more keeps the already loaded accounts visible", (await recoveryRegion.innerText()).includes("Showing 2 of 4 accounts"))
  check("a failed load-more offers a page retry", await recoveryRegion.getByRole("button", { name: "Retry loading more" }).count() === 1)
  state.recoveryPageErrors.delete(2)
  await recoveryRegion.getByRole("button", { name: "Retry loading more" }).click()
  await page.getByText("Showing 3 of 4 accounts").waitFor()
  await page.waitForTimeout(300)
  check("load more requests the next page", state.recoveryPage === "2")
  check("the second page shows the previously redacted account", (await recoveryRegion.innerText()).includes("previously redacted customer account"))
  await recoveryRegion.getByRole("button", { name: "Load more" }).click()
  await recoveryRegion.getByRole("button", { name: "Load more" }).waitFor({ state: "detached" })
  await page.waitForTimeout(300)
  const completeText = await recoveryRegion.innerText()
  check("loading all pages removes the paging notice", !completeText.includes("Showing"))
  check("loading all pages makes the complete server list authoritative", !completeText.includes("locked visitor account"))
  check("loading all pages requests the last page", state.recoveryPage === "3")

  await page.evaluate(() => sessionStorage.clear())
  state.recoveryMode = "hang"
  state.recoveryCalls = 0
  await page.goto(`${BASE}/admin/customers`, { waitUntil: "load" })
  await recoveryRegion.getByText("Loading the server recovery list").waitFor({ timeout: 8000 }).catch(() => {})
  const loadingText = await recoveryRegion.innerText().catch(() => "")
  check("a hung recovery GET shows a bounded loading state", loadingText.includes("Loading the server recovery list"))
  await recoveryRegion.getByText(/server recovery list could not be loaded/).waitFor({ timeout: 15000 })
  const timedOutText = await recoveryRegion.innerText()
  check("a hung recovery GET becomes unavailable with a retry", timedOutText.includes("Retry loading"))
  check("a hung recovery GET does not retry automatically", state.recoveryCalls === 1)
  check("a hung recovery GET makes no execute request", state.executeCalls.length === 0)

  await context.__browser.close()
}

async function runRecoveryRoleChecks() {
  const { context, page, state } = await newPage()
  state.recoveryTotal = 1
  state.serverRecovery = [serverRecoveryAccount()]
  await page.goto(BASE, { waitUntil: "domcontentloaded" })
  await page.evaluate(() => sessionStorage.clear())
  await openCustomers(page)
  check("role check starts with the server recovery card", (await page.locator("body").innerText()).includes("Cleanup still pending for an anonymized customer account"))

  state.role = "low"
  state.recoveryCalls = 0
  state.serverRecovery = []
  state.recoveryTotal = 0
  await page.reload({ waitUntil: "networkidle" })
  await page.waitForTimeout(900)
  const lowText = await page.locator("body").innerText()
  check("a role change to low permission hides the recovery section", !lowText.includes("Cleanup still pending for an anonymized customer account"))
  check("a role change to low permission makes no recovery request", state.recoveryCalls === 0)
  check("a role change to low permission keeps Anonymize hidden", await page.getByRole("button", { name: "Anonymize" }).count() === 0)

  state.role = "super"
  state.recoveryCalls = 0
  state.serverRecovery = [serverRecoveryAccount()]
  state.recoveryTotal = 1
  await page.reload({ waitUntil: "networkidle" })
  await page.waitForTimeout(900)
  check("a role change back reloads the server recovery list", state.recoveryCalls === 1 && (await page.locator("body").innerText()).includes("Cleanup still pending for an anonymized customer account"))

  await context.__browser.close()
}

async function runProfessionalRowChecks() {
  const { context, page } = await newPage()
  await page.goto(`${BASE}/admin/professionals/manage`, { waitUntil: "networkidle" })
  await page.waitForTimeout(700)
  const manageCard = page.locator("div").filter({ hasText: "Personal details are no longer available." }).last()
  const manageText = await manageCard.innerText()
  check("professional management hides level control", !manageText.includes("Adjust level"))
  check("professional management hides reward", !manageText.includes("Reward"))
  check("professional management hides suspend and reactivate", !/\b(Suspend|Reactivate)\b/.test(manageText))
  check("professional management hides anonymize and delete", !/\b(Anonymize|Delete permanently)\b/.test(manageText))
  check("professional management keeps financial facts", manageText.includes("EUR 500"))
  check("professional management hides the business country", !manageText.includes("BE"), manageText)
  check("professional management hides the stale company name", !manageText.includes("Old Company"))
  const normalManageCard = page.locator("div").filter({ hasText: "Live Company" }).last()
  const normalManageText = await normalManageCard.innerText()
  check("a normal professional management row keeps its country", normalManageText.includes("BE"))
  check("a normal professional management row keeps financial facts", normalManageText.includes("EUR 300"))

  await page.goto(`${BASE}/admin/professionals?status=approved`, { waitUntil: "networkidle" })
  await page.waitForTimeout(700)
  const approvalCard = page.locator("div").filter({ hasText: "This account has been anonymized." }).last()
  const approvalText = await approvalCard.innerText()
  check("professional approval hides approve/reject/suspend", !/\b(Approve|Reject|Suspend|Reactivate)\b/.test(approvalText))
  check("professional approval hides chat and anonymize", !/\b(Chat|Anonymize)\b/.test(approvalText))
  check("professional approval hides the stale company name", !approvalText.includes("Old Company"))
  check("professional approval hides the stale username", !approvalText.includes("old-company-username"))
  check("professional approval hides stale pending ID-change values", !approvalText.includes("Pending ID Changes") && !approvalText.includes("Old Legal Name") && !approvalText.includes("New Legal Name"))
  check("professional approval hides stale VAT and service data", !approvalText.includes("BE-OLD-VAT") && !approvalText.includes("Old Service"))

  const normalApprovalCard = page.locator("div").filter({ hasText: "Nora Normal" }).filter({ has: page.getByRole("button", { name: "View Details" }) }).last()
  const normalApprovalText = await normalApprovalCard.innerText()
  check("a normal approval row keeps company and username", normalApprovalText.includes("Live Company") && normalApprovalText.includes("live-username"))
  check("a normal approval row keeps its actions", await normalApprovalCard.getByRole("button", { name: "View Details" }).count() === 1)
  await normalApprovalCard.getByRole("button", { name: "View Details" }).click()
  await page.getByRole("heading", { name: "Professional Details" }).waitFor()
  const normalDetailText = await page.locator("body").innerText()
  check("a normal professional detail keeps company and username", normalDetailText.includes("Live Company") && normalDetailText.includes("live-username"))
  check("a normal professional detail keeps its identity document section", normalDetailText.includes("ID Proof Document"))
  await page.keyboard.press("Escape").catch(() => {})
  await page.waitForTimeout(250)

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${BASE}/admin/professionals/manage`, { waitUntil: "networkidle" })
    await page.waitForTimeout(500)
    const anonAtWidth = page.locator("div").filter({ hasText: "Personal details are no longer available." }).last()
    const anonAtWidthText = await anonAtWidth.innerText()
    check(`professional management hides the business country at ${width}px`, !anonAtWidthText.includes("BE"))
    check(`a normal professional row keeps its country at ${width}px`, (await page.locator("div").filter({ hasText: "Live Company" }).last().innerText()).includes("BE"))
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    check(`professional management has no horizontal overflow at ${width}px`, !overflow)
  }
  await context.__browser.close()
}

async function runChatChecks() {
  const { context, page } = await newPage({ role: "customer" })
  await page.unroute(`${BACKEND}/**`)
  const customerId = "507f1f77bcf86cd799439011"
  const professionalId = "507f1f77bcf86cd799439012"
  const conversationId = "665f1f77bcf86cd799439020"
  const customer = { _id: customerId, name: "Carla Customer", email: "carla@example.com", phone: "", role: "customer", isEmailVerified: true, isPhoneVerified: true, createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z" }
  const professional = { _id: professionalId, name: "Pia Professional", email: "pia@example.com", phone: "", role: "professional", professionalStatus: "approved", isEmailVerified: true, isPhoneVerified: true, createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z" }
  const anonCustomer = { _id: customerId, name: "[deleted user]", email: `deleted-${customerId}@anon.local`, isAnonymized: true, deletedAt: "2026-10-20T10:00:00.000Z", profileImage: "https://example.com/old-customer.jpg", role: "customer" }
  const anonProfessional = { _id: professionalId, name: "[deleted user]", email: `deleted-${professionalId}@anon.local`, isAnonymized: true, deletedAt: "2026-10-20T10:00:00.000Z", profileImage: "https://example.com/old-avatar.jpg", role: "professional" }
  const state = { role: "customer", quoteCalls: 0, sendCalls: 0, normal: false }
  const normalProfessional = { _id: professionalId, name: "Pia Professional", username: "pia", email: "pia@example.com", role: "professional" }
  const normalCustomer = { _id: customerId, name: "Carla Customer", email: "carla@example.com", role: "customer" }
  const conversationForRole = () => ({
    _id: conversationId,
    type: "direct",
    customerId: state.role === "customer" && !state.normal ? { _id: customerId, name: "Carla Customer", email: "carla@example.com" } : state.normal ? normalCustomer : anonCustomer,
    professionalId: state.role === "customer" ? (state.normal ? normalProfessional : anonProfessional) : normalProfessional,
    initiatedBy: customerId,
    status: "active",
    starredBy: [],
    archivedBy: [],
    labels: [],
    lastMessageAt: "2026-10-20T10:00:00.000Z",
    lastMessagePreview: "Historical message",
    customerUnreadCount: 0,
    professionalUnreadCount: 0,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-20T10:00:00.000Z",
  })
  const messagesForRole = () => [{
    _id: "665f1f77bcf86cd799439030",
    conversationId,
    senderId: state.normal ? (state.role === "customer" ? normalProfessional : normalCustomer) : (state.role === "customer" ? anonProfessional : anonCustomer),
    senderRole: state.role === "customer" ? "professional" : "customer",
    messageType: "text",
    text: "Historical message from before anonymization",
    images: [],
    createdAt: "2026-10-20T10:00:00.000Z",
    updatedAt: "2026-10-20T10:00:00.000Z",
  }]
  await page.route(`${BACKEND}/**`, async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path === "/api/auth/me") return json(route, 200, { success: true, user: state.role === "customer" ? customer : professional })
    if (path === "/api/chat/conversations" && route.request().method() === "GET") {
      return json(route, 200, { success: true, data: { conversations: [conversationForRole()], pagination: { page: 1, limit: 50, total: 1, totalPages: 1 } } })
    }
    if (path === `/api/chat/conversations/${conversationId}/messages/search`) {
      return json(route, 200, {
        success: true,
        data: {
          results: [
            { _id: "665f1f77bcf86cd799439031", conversationId, senderId: anonProfessional, senderRole: "professional", messageType: "text", text: "[deleted message]", images: [], createdAt: "2026-10-20T10:00:00.000Z", updatedAt: "2026-10-20T10:00:00.000Z" },
            { _id: "665f1f77bcf86cd799439032", conversationId, senderId: anonCustomer, senderRole: "customer", messageType: "text", text: "Retained quote scope from the counterparty", images: [], createdAt: "2026-10-20T10:05:00.000Z", updatedAt: "2026-10-20T10:05:00.000Z" },
          ],
          total: 2,
        },
      })
    }
    if (path === `/api/chat/conversations/${conversationId}/messages`) {
      if (route.request().method() === "POST") {
        state.sendCalls += 1
        return json(route, 200, { success: true, data: { message: messagesForRole()[0] } })
      }
      return json(route, 200, { success: true, data: { conversation: conversationForRole(), messages: messagesForRole(), pagination: { limit: 100, hasMore: false, nextCursor: null } } })
    }
    if (path === `/api/chat/conversations/${conversationId}/read`) return json(route, 200, { success: true })
    if (path === `/api/chat/conversations/${conversationId}/info`) {
      return json(route, 200, { success: true, data: { conversation: conversationForRole(), stats: { totalBookings: 0, completedBookings: 0, avgCustomerRating: 0, avgCommunication: 0, avgValueOfDelivery: 0, avgQualityOfService: 0, avgProfessionalRating: 0, totalCustomerReviews: 0, totalProfessionalReviews: 0, professionalLevel: "", adminTags: [], avgResponseTimeMs: 0, pendingBookings: [], absence: null } } })
    }
    if (path === "/api/quotations/direct") {
      state.quoteCalls += 1
      return json(route, 403, { success: false })
    }
    if (path === "/api/quotations/active-projects") return json(route, 200, { success: true, data: { projects: [] } })
    return json(route, 200, { success: true, data: {} })
  })

  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle" })
  await page.waitForTimeout(800)
  let body = await page.locator("body").innerText()
  check("main chat uses localized deleted user", body.includes("Deleted user"))
  check("main chat never shows raw placeholder", !body.includes("[deleted user]"))
  check("main chat keeps historical message", body.includes("Historical message from before anonymization"))
  check("main chat replaces composer", body.includes("You cannot send messages because this account is no longer available."))
  check("main chat has no textarea", await page.locator("textarea").count() === 0)
  check("main chat sends nothing", state.sendCalls === 0)
  check("main chat does not load old avatar", !body.includes("old-avatar.jpg"))

  state.role = "professional"
  await page.reload({ waitUntil: "networkidle" })
  await page.waitForTimeout(800)
  body = await page.locator("body").innerText()
  check("professional chat sees deleted customer", body.includes("Deleted user"))
  check("professional chat replaces composer", body.includes("You cannot send messages because this account is no longer available."))
  const quote = page.getByRole("button", { name: "Send quotation" })
  check("professional quotation action is disabled", await quote.count() === 1 && await quote.isDisabled())
  await quote.click({ force: true }).catch(() => {})
  await page.waitForTimeout(250)
  check("professional quotation action makes no request", state.quoteCalls === 0)

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" })
  await page.waitForTimeout(800)
  await page.evaluate(() => document.querySelector('[aria-label="Cookie consent"]')?.remove())
  await page.getByRole("button", { name: "Chat" }).last().click()
  await page.waitForTimeout(700)
  const widget = page.locator("div.fixed.bottom-4.right-4")
  await widget.getByText("Deleted user").last().click()
  await page.waitForTimeout(700)
  const widgetText = await widget.innerText()
  check("widget uses deleted user", widgetText.includes("Deleted user"))
  check("widget replaces composer", widgetText.includes("You cannot send messages because this account is no longer available."))
  const widgetQuote = widget.getByRole("button", { name: "Send quotation" })
  check("widget quotation action is disabled", await widgetQuote.count() === 1 && await widgetQuote.isDisabled())
  await widgetQuote.click({ force: true }).catch(() => {})
  await page.waitForTimeout(250)
  check("widget quotation action makes no request", state.quoteCalls === 0)

  state.role = "customer"
  state.normal = false
  for (const [locale, label, notice] of [
    ["en", "Deleted user", "You cannot send messages because this account is no longer available."],
    ["nl", "Verwijderde gebruiker", "Je kunt geen berichten sturen omdat dit account niet meer beschikbaar is."],
    ["fr", "Utilisateur supprimé", "Vous ne pouvez pas envoyer de messages car ce compte n'est plus disponible."],
  ]) {
    await context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: BASE }])
    await page.goto(`${BASE}/chat`, { waitUntil: "networkidle" })
    await page.waitForTimeout(700)
    const localizedText = await page.locator("body").innerText()
    check(`main chat deleted label is localized in ${locale}`, localizedText.includes(label) && localizedText.includes(notice) && !localizedText.includes("[deleted user]"))
  }

  state.role = "customer"
  state.normal = true
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }])
  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle" })
  await page.waitForTimeout(800)
  const normalText = await page.locator("body").innerText()
  check("normal chat keeps the composer", await page.locator("textarea").count() === 1)
  check("normal chat does not show the unavailable notice", !normalText.includes("You cannot send messages because this account is no longer available."))
  const textarea = page.locator("textarea").first()
  await textarea.fill("Normal message")
  check("normal chat send stays enabled", await page.getByRole("button", { name: "Send message" }).isEnabled().catch(() => true))

  await page.getByRole("button", { name: "Search in chat" }).click()
  const searchInput = page.getByPlaceholder("Search messages...")
  await searchInput.fill("deleted")
  await searchInput.press("Enter")
  await page.waitForTimeout(600)
  const searchText = await page.locator("body").innerText()
  check("in-chat search localizes a redacted message placeholder", searchText.includes("Message removed") && !searchText.includes("[deleted message]"))
  check("in-chat search keeps counterparty-authored retained text", searchText.includes("Retained quote scope from the counterparty"))

  await context.__browser.close()
}

async function runSupportChecks() {
  const { context, page } = await newPage()
  await page.unroute(`${BACKEND}/**`)

  const makeSupportItem = ({ id, subject, anonymized, meetingLink, linkActive, requesterName = "Deleted user" }) => {
    const requesterId = anonymized ? ids.normal : ids.normalProfessional
    const requester = {
      _id: requesterId,
      id: requesterId,
      name: requesterName,
      email: anonymized ? `deleted-${requesterId}@anon.local` : "nora@example.com",
      role: "customer",
      ...(anonymized ? { isAnonymized: true, deletedAt: "2026-10-20T10:00:00.000Z" } : { isAnonymized: false, deletedAt: null }),
    }
    return {
      _id: id,
      id,
      kind: "meeting",
      ticketNumber: `SUP-2026-${id.slice(-6)}`,
      subject,
      description: "Historical support description",
      reason: "other",
      reasonLabel: "Other",
      status: "scheduled",
      ticketStatus: "open",
      requester,
      requesterRole: "customer",
      booking: null,
      attachments: [],
      attachment: null,
      replies: [],
      legacy: false,
      tags: { reason: "other", reasonLabel: "Other", booking: null, userType: "customer", meetingAt: "2026-11-02T10:00:00.000Z", kind: "meeting" },
      meeting: {
        status: "scheduled",
        scheduledAt: "2026-11-02T10:00:00.000Z",
        endAt: "2026-11-02T10:30:00.000Z",
        durationMinutes: 30,
        timeZone: "Europe/Brussels",
        meetingLink,
        linkActive,
        linkAddedAt: "2026-10-20T10:00:00.000Z",
        linkUpdatedAt: null,
        confirmationEmailSentAt: "2026-10-20T10:01:00.000Z",
        assignedAdminName: "Super Admin",
        cancellationReason: null,
        cancelledAt: null,
        cancelledBy: null,
        preferredTimes: null,
        adminResponse: null,
        legacy: false,
      },
      createdAt: "2026-10-20T10:00:00.000Z",
      updatedAt: "2026-10-20T10:00:00.000Z",
      user: requester,
      userId: requester,
      meetingAdmin: { _id: admin._id, id: admin._id, name: "Super Admin", email: "super@example.com", role: "admin" },
      replyCount: 0,
      lastReplyAt: null,
      internalNotes: [],
    }
  }

  const supportItems = [
    makeSupportItem({
      id: "665f1f77bcf86cd799439031",
      subject: "Anonymized meeting without a link",
      anonymized: true,
      meetingLink: null,
      linkActive: false,
    }),
    makeSupportItem({
      id: "665f1f77bcf86cd799439032",
      subject: "Anonymized meeting with a stale link",
      anonymized: true,
      meetingLink: "https://meet.example.com/old-private-room",
      linkActive: true,
    }),
    makeSupportItem({
      id: "665f1f77bcf86cd799439033",
      subject: "Live meeting request",
      anonymized: false,
      requesterName: "Nora Normal",
      meetingLink: "https://meet.example.com/live-room",
      linkActive: true,
    }),
    makeSupportItem({
      id: "665f1f77bcf86cd799439034",
      subject: "Live scheduled meeting without a link",
      anonymized: false,
      requesterName: "Nora Normal",
      meetingLink: null,
      linkActive: false,
    }),
  ]

  await page.route(`${BACKEND}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === "/api/auth/me") return json(route, 200, { success: true, user: admin })
    if (url.pathname === "/api/admin/support/items") {
      return json(route, 200, { success: true, data: { items: supportItems, pagination: { page: 1, limit: 20, total: supportItems.length, totalPages: 1 } } })
    }
    return json(route, 200, { success: true, data: {} })
  })
  await page.goto(`${BASE}/admin/support`, { waitUntil: "networkidle" })
  await page.waitForTimeout(900)
  const body = await page.locator("body").innerText()

  const noLinkCard = page.locator("article").filter({ hasText: "Anonymized meeting without a link" }).last()
  const noLinkText = await noLinkCard.innerText()
  check("support shows deleted requester", body.includes("Deleted user"))
  check("support hides fake email", !body.includes(`deleted-${ids.normal}@anon.local`))
  check("support keeps historical meeting time and status", noLinkText.includes("2026") && noLinkText.includes("Scheduled"))
  check("an anonymized meeting without a link uses historical read-only copy", noLinkText.includes("Historical meeting."))
  check("an anonymized meeting without a link does not ask for a new link", !noLinkText.includes("Add a real HTTPS link"))
  check("an anonymized meeting does not claim the participant can join", !noLinkText.includes("participant can join") && !noLinkText.includes("has not received a meeting link"))
  check("an anonymized meeting without a link has no red configuration warning", !noLinkText.includes("No valid HTTPS meeting link is stored"), noLinkText)
  check("an anonymized meeting without a link uses neutral retained-history wording", noLinkText.includes("No meeting link was retained for this historical meeting."))

  const staleLinkCard = page.locator("article").filter({ hasText: "Anonymized meeting with a stale link" }).last()
  const staleLinkText = await staleLinkCard.innerText()
  check("support hides a stale meeting link and anchor", !staleLinkText.includes("meet.example.com/old-private-room") && !staleLinkText.includes("Open meeting link"))
  check("support explains a hidden historical link", staleLinkText.includes("Meeting link hidden because the recipient account is no longer available."))
  check("support keeps the stale-link meeting historical copy", staleLinkText.includes("Historical meeting.") && !staleLinkText.includes("participant can join"))
  check("a stale anonymized link never shows the red no-link warning", !staleLinkText.includes("No valid HTTPS meeting link is stored"))

  const liveCard = page.locator("article").filter({ hasText: "Live meeting request" }).last()
  const liveText = await liveCard.innerText()
  check("a live meeting keeps the normal link flow", liveText.includes("Open meeting link") && liveText.includes("participant can join"))
  check("a live meeting does not show the historical copy", !liveText.includes("Historical meeting."))

  const liveInvalidCard = page.locator("article").filter({ hasText: "Live scheduled meeting without a link" }).last()
  const liveInvalidText = await liveInvalidCard.innerText()
  check("a live scheduled meeting without a link keeps the real invalid-link warning", liveInvalidText.includes("No valid HTTPS meeting link is stored for this scheduled meeting."))
  check("a live scheduled meeting without a link keeps the actionable add-link prompt", liveInvalidText.includes("Add a real HTTPS link"))
  check("a live scheduled meeting without a link is not called historical", !liveInvalidText.includes("Historical meeting."))

  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${BASE}/admin/support`, { waitUntil: "networkidle" })
    await page.waitForTimeout(700)
    const noLinkAtWidth = page.locator("article").filter({ hasText: "Anonymized meeting without a link" }).last()
    const noLinkAtWidthText = await noLinkAtWidth.innerText()
    check(`an anonymized no-link meeting stays historical at ${width}px`, noLinkAtWidthText.includes("Historical meeting.") && !noLinkAtWidthText.includes("No valid HTTPS meeting link is stored"))
    const cardBox = await noLinkAtWidth.boundingBox()
    check(
      `an anonymized no-link meeting card fits at ${width}px`,
      Boolean(cardBox) && cardBox.x >= -1 && cardBox.x + cardBox.width <= width + 1,
      JSON.stringify(cardBox)
    )
    if (width === 1280) {
      const liveInvalidAtWidth = await page.locator("article").filter({ hasText: "Live scheduled meeting without a link" }).last().innerText()
      check("the live invalid-link warning survives the responsive pass", liveInvalidAtWidth.includes("No valid HTTPS meeting link is stored"))
    }
  }

  await context.__browser.close()
}

async function runRecoveryResolutionChecks() {
  const { context, page, state } = await newPage()
  await openCustomers(page)

  const triggerAmbiguousExecute = async () => {
    state.mode = "gateway"
    await openDialog(page, "Uma Uncertain")
    const input = page.locator('input[autocomplete="off"]')
    await input.fill("ANONYMIZE")
    await page.getByRole("button", { name: "Anonymize account" }).last().click()
    await page.waitForTimeout(700)
    await page.getByRole("button", { name: "Cancel" }).click()
    await page.waitForTimeout(450)
  }
  const recoveryStorage = async (key) =>
    page.evaluate((storageKey) => sessionStorage.getItem(storageKey), key)
  const recoveryKey = "fixera-admin-anonymize-recovery:v2:665f1f77bcf86cd799439000:customers"

  await resetScenario(page, state)
  await triggerAmbiguousExecute()
  check("resolution setup leaves an unknown outcome card", (await page.locator("body").innerText()).includes("outcome needs a status check"))
  state.mode = "partial"
  await page.getByRole("button", { name: "Check status and resume" }).click()
  await page.getByRole("heading", { name: "Anonymize account" }).waitFor()
  await page.waitForTimeout(600)
  check("504 then an eligible preview shows the account is unchanged", (await page.locator("body").innerText()).includes("Ready to anonymize"))
  check("504 then an eligible preview sends no second PUT", state.executeCalls.length === 1)
  await closeDialog(page)
  check("an eligible status check clears the unknown recovery card", !(await page.locator("body").innerText()).includes("outcome needs a status check"))
  const eligibleStorage = await recoveryStorage(recoveryKey)
  check("an eligible status check removes the stored unknown record", !eligibleStorage || !eligibleStorage.includes("status_unknown"))

  await resetScenario(page, state)
  await triggerAmbiguousExecute()
  state.mode = "blocked-after"
  await page.getByRole("button", { name: "Check status and resume" }).click()
  await page.getByRole("heading", { name: "Anonymize account" }).waitFor()
  await page.waitForTimeout(600)
  const blockedAfterText = await page.locator("body").innerText()
  check("504 then a blocked preview shows the real blockers", blockedAfterText.includes("Anonymization blocked") && blockedAfterText.includes("2 bookings still have an active lifecycle state."))
  check("504 then a blocked preview sends no second PUT", state.executeCalls.length === 1)
  await closeDialog(page)
  check("a blocked not-applied status check clears the unknown recovery card", !(await page.locator("body").innerText()).includes("outcome needs a status check"))
  const blockedStorage = await recoveryStorage(recoveryKey)
  check("a blocked not-applied status check removes the stored unknown record", !blockedStorage || !blockedStorage.includes("status_unknown"))

  await resetScenario(page, state)
  await triggerAmbiguousExecute()
  state.mode = "incomplete-after"
  await page.getByRole("button", { name: "Check status and resume" }).click()
  await page.getByRole("heading", { name: "Anonymize account" }).waitFor()
  await page.waitForTimeout(600)
  const partialAfterText = await page.locator("body").innerText()
  check("504 then a partially started preview names the real recovery state", partialAfterText.includes("Cleanup needs recovery") && partialAfterText.includes("Retry anonymization"))
  check("504 then a partially started preview sends no second PUT", state.executeCalls.length === 1)
  await closeDialog(page)
  const partialCardText = await page.locator("body").innerText()
  check("a partially started status check keeps a recovery card", partialCardText.includes("Recovery still pending for a locked customer account"))
  check("a partially started status check no longer says the outcome is unknown", !partialCardText.includes("outcome needs a status check"))
  const partialStorage = JSON.parse(await recoveryStorage(recoveryKey))
  const partialRecord = partialStorage.find((entry) => entry.targetId === ids.uncertain)
  check("a partially started status check stores the exact tombstone state", partialRecord?.state === "recovery_required" && partialRecord?.identityRemoved === false)
  check("a partially started status check preserves explicit access and redaction facts", partialRecord?.accessDisabled === true && partialRecord?.needsRedaction === true)
  check("a partially started status check keeps its session provenance", partialRecord?.source === "session")
  check("a partially started status check keeps the pending cleanup counts", partialRecord?.cleanup?.pendingFiles === 1 && partialRecord?.cleanup?.pendingCalendarReleases === 1)
  check("a partially started status check stores no old identity", !/Uma Uncertain|uma@example\.com/.test(await recoveryStorage(recoveryKey)))

  await resetScenario(page, state)
  state.recoveryTotal = 1
  state.serverRecovery = [serverRecoveryAccount()]
  await page.evaluate(({ key, otherId }) => {
    sessionStorage.setItem(key, JSON.stringify([{
      targetId: otherId,
      role: "visitor",
      state: "status_unknown",
      identityRemoved: false,
      cleanup: { pendingFiles: 0, pendingCalendarReleases: 0, deletedFiles: 0, failedFiles: 0, completedAt: null, lastError: null },
      source: "session",
    }]))
  }, { key: recoveryKey, otherId: "665f1f77bcf86cd799439099" })
  await openCustomers(page)
  const mixedText = await page.locator("body").innerText()
  check("a server count is not downgraded by a coexisting session fallback", !mixedText.includes("Showing 0 of 1"))
  check("the card distinguishes session-only records from the server total", mixedText.includes("1 session-only recovery record is also shown") && mixedText.includes("not included in the server total of 1"))
  const serverRecoveryCard = page.locator('[role="alert"]').filter({ hasText: "Cleanup still pending for an anonymized customer account" }).last()
  await serverRecoveryCard.getByRole("button", { name: "Check status and resume" }).click()
  await page.getByRole("heading", { name: "Anonymize account" }).waitFor()
  await page.waitForTimeout(600)
  const resumedText = await page.locator("body").innerText()
  check("a server recovery preview shows the refreshed partial cleanup", resumedText.includes("Already anonymized") && resumedText.includes("File cleanup is incomplete."))
  await closeDialog(page)
  const afterResumeText = await page.locator("body").innerText()
  check("resuming a server recovery record keeps its card", afterResumeText.includes("Cleanup still pending for an anonymized customer account"))
  check("resuming a server recovery record keeps the source count", !afterResumeText.includes("Showing 0 of 1"))
  check("resuming a server recovery record makes no execute request", state.executeCalls.length === 0)
  const resumedRecords = JSON.parse(await recoveryStorage(recoveryKey))
  const resumedServer = resumedRecords.find((entry) => entry.targetId === ids.alreadyPending)
  check("resuming keeps server provenance in storage", resumedServer?.source === "server")
  check("resuming keeps the server access and redaction facts", resumedServer?.accessDisabled === true && resumedServer?.needsRedaction === false)
  check("resuming keeps the refreshed partial state", resumedServer?.state === "already_anonymized" && resumedServer?.identityRemoved === true)
  check("resuming keeps the pending cleanup counts", resumedServer?.cleanup?.pendingFiles === 1 && resumedServer?.cleanup?.pendingCalendarReleases === 1)
  const untouchedSession = resumedRecords.find((entry) => entry.targetId === "665f1f77bcf86cd799439099")
  check("resuming a server record does not drop the unrelated session fallback", untouchedSession?.source === "session" && untouchedSession?.state === "status_unknown")

  await context.__browser.close()
}

async function runSupportWireChecks() {
  const { context, page } = await newPage()
  await page.unroute(`${BACKEND}/**`)
  const items = [
    wireFixture("support-current-anonymized"),
    wireFixture("support-legacy-anonymized"),
  ]
  await page.route(`${BACKEND}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === "/api/auth/me") return json(route, 200, { success: true, user: admin })
    if (url.pathname === "/api/admin/support/items") {
      return json(route, 200, {
        success: true,
        data: { items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } },
      })
    }
    return json(route, 200, { success: true, data: {} })
  })
  await page.goto(`${BASE}/admin/support`, { waitUntil: "networkidle" })
  await page.waitForTimeout(900)
  const body = await page.locator("body").innerText()
  check("settled support wire sample shows the deleted requester", body.includes("Deleted user"))
  check("settled support wire sample exposes no fake contact", !body.includes("@anon.local"))

  const currentCard = page.locator("article").filter({ hasText: "SUP-2026-000031" }).last()
  const currentText = await currentCard.innerText()
  check("current support serializer wire sample stays historical", currentText.includes("Historical meeting.") && currentText.includes("No meeting link was retained for this historical meeting."))
  check("current support serializer wire sample has no operational link copy", !currentText.includes("No valid HTTPS meeting link is stored") && !currentText.includes("Add a real HTTPS link") && !currentText.includes("participant can join"))
  check("current support serializer wire sample exposes no link action", await currentCard.getByRole("button", { name: /meeting link/i }).count() === 0)

  const legacyCard = page.locator("article").filter({ hasText: "Read-only" }).last()
  const legacyText = await legacyCard.innerText()
  check("legacy MeetingRequest wire sample carries copied anon flags", legacyText.includes("Deleted user"))
  check("legacy MeetingRequest wire sample stays historical with no link warning", legacyText.includes("Historical meeting.") && legacyText.includes("No meeting link was retained for this historical meeting.") && !legacyText.includes("No valid HTTPS meeting link is stored"))
  check("legacy MeetingRequest wire sample exposes no link action", await legacyCard.getByRole("button", { name: /meeting link/i }).count() === 0)

  await context.__browser.close()
}

async function runResponsiveChecks() {
  for (const width of [320, 390, 1280]) {
    const { context, page, state } = await newPage({ viewport: { width, height: 900 } })
    state.recoveryMode = "error"
    await openCustomers(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    check(`admin customer list has no horizontal overflow at ${width}px`, !overflow)
    const recoveryBox = await page.getByRole("region", { name: "Pending anonymization cleanup" }).boundingBox()
    check(
      `recovery unavailable status fits at ${width}px`,
      Boolean(recoveryBox) && recoveryBox.x >= -1 && recoveryBox.x + recoveryBox.width <= width + 1,
      JSON.stringify(recoveryBox)
    )
    check(
      `recovery unavailable status keeps its retry at ${width}px`,
      (await page.getByRole("region", { name: "Pending anonymization cleanup" }).innerText()).includes("Retry loading")
    )

    state.recoveryMode = "ok"
    state.recoveryTotal = 2
    state.recoveryTotalPages = 2
    state.serverRecovery = [serverRecoveryAccount()]
    await page.evaluate((key) => {
      sessionStorage.setItem(key, JSON.stringify([{
        targetId: "665f1f77bcf86cd799439099",
        role: "visitor",
        state: "status_unknown",
        identityRemoved: false,
        cleanup: { pendingFiles: 0, pendingCalendarReleases: 0, deletedFiles: 0, failedFiles: 0, completedAt: null, lastError: null },
        source: "session",
      }]))
    }, "fixera-admin-anonymize-recovery:v2:665f1f77bcf86cd799439000:customers")
    await page.reload({ waitUntil: "networkidle" })
    await page.waitForTimeout(600)
    const mixedRecoveryText = await page.getByRole("region", { name: "Pending anonymization cleanup" }).innerText()
    check(`the source count and session fallback fit at ${width}px`, mixedRecoveryText.includes("1 session-only recovery record is also shown") && mixedRecoveryText.includes("Showing 1 of 2 accounts from the server"))
    const mixedRecoveryBox = await page.getByRole("region", { name: "Pending anonymization cleanup" }).boundingBox()
    check(
      `the source count and session fallback stay within ${width}px`,
      Boolean(mixedRecoveryBox) && mixedRecoveryBox.x >= -1 && mixedRecoveryBox.x + mixedRecoveryBox.width <= width + 1,
      JSON.stringify(mixedRecoveryBox)
    )

    await openDialog(page, "Ada Customer")
    await page.waitForTimeout(400)
    const dialogRect = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][data-state="open"]')
      if (!dialog) return null
      const rect = dialog.getBoundingClientRect()
      return { left: rect.left, right: rect.right, width: rect.width, viewport: window.innerWidth }
    })
    const dialogOverflow = !dialogRect || dialogRect.left < -1 || dialogRect.right > dialogRect.viewport + 1 || dialogRect.width > dialogRect.viewport
    check(`anonymize dialog fits at ${width}px`, !dialogOverflow, JSON.stringify(dialogRect))
    await context.__browser.close()
  }
}

await runAdminChecks()
await runRecoveryFailureChecks()
await runRecoveryRoleChecks()
await runRecoveryResolutionChecks()
await runProfessionalRowChecks()
await runChatChecks()
await runSupportChecks()
await runSupportWireChecks()
await runResponsiveChecks()

const failed = results.filter((result) => !result.ok)
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2))
process.exit(failed.length > 0 ? 1 : 0)
