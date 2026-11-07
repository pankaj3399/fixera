import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hooks, loadComponent, findAll, common, settle, textOf } from './reviewComponentHarness.mjs'

test('every employee calendar includes company closure days and ranges after list refresh', async () => {
  const previousFetch = globalThis.fetch
  const state = hooks()
  const Calendar = () => null
  const employees = ['one', 'two'].map(_id => ({ _id, name: _id, isActive: true, hasEmail: true, invitedAt: '2026-01-01' }))
  let closures = { companyBlockedDates: [{ date: '2027-01-04', reason: 'Closed' }], companyBlockedRanges: [{ startDate: '2027-01-06T09:00:00Z', endDate: '2027-01-07T17:00:00Z', reason: 'Holiday', isHoliday: true }] }
  globalThis.fetch = async () => ({ json: async () => ({ success: true, data: { employees, ...closures } }) })
  try {
    const Team = loadComponent('../components/TeamManagement.tsx', {
      ...common, react: state.api,
      '@/components/calendar/WeeklyAvailabilityCalendar': { default: Calendar, __esModule: true },
      '@/lib/dateUtils': { toLocalInputValue: v => v, getDateValue: v => v, toIsoDateTime: v => v },
      '@/lib/scheduleUtils': { getScheduleWindow: () => ({}), getVisibleScheduleDays: () => [] },
      '@/lib/calendar/bookingEvents': { bookingCalendarEventType: () => 'booking' },
      '@/lib/i18n/useFormatLocale': { useFormatLocale: () => ({ intl: 'en' }) },
    })
    const render = () => { const tree = state.render(() => Team()); state.flush(); return tree }
    render(); await settle()
    for (let i = 0; i < 2; i++) {
      let tree = render()
      const buttons = findAll(tree, node => node.props?.title === 'teamManagement.actions.manageAvailability')
      assert.equal(buttons.length, 2)
      buttons[i].props.onClick()
      const events = findAll(render(), node => node.type === Calendar)[0].props.events
      assert.equal(events.length, 2)
      assert.ok(events.every(event => event.type === 'company' && event.readOnly))
      assert.equal(events[0].title, 'eventTitles.holiday')
      assert.equal(events[1].title, 'eventTitles.companyClosure')
      assert.equal(events[1].start.getDate(), 4)
      assert.ok(events[1].end > events[1].start)
    }
    // Save reloads the employee-list response while booking/personal ranges
    // are unchanged: closure state must be a calendar memo dependency.
    closures = { companyBlockedDates: [{ date: '2027-02-01T00:00:00.000Z', reason: 'Updated closure' }], companyBlockedRanges: [] }
    const save = findAll(render(), node => node.props?.onClick && textOf(node) === 'teamManagement.availabilityDialog.saveAvailability')[0]
    assert.ok(save)
    await save.props.onClick(); await settle()
    const updated = findAll(render(), node => node.type === Calendar)[0].props.events
    assert.equal(updated.length, 1)
    assert.equal(updated[0].meta.note, 'Updated closure')
    assert.equal(updated[0].start.getMonth(), 1)
  } finally { state.unmount(); globalThis.fetch = previousFetch }
})
