import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  ADMIN_HOME_HREF,
  groupBadgeDisplay,
  itemBadgeDisplay,
  type AdminNavActive,
  type AdminNavBadgeDisplay,
  type AdminNavBadgeSnapshot,
  type AdminNavGroup,
} from '@/lib/admin/navigation'

export function AdminNavBadge({ display, context }: { display: AdminNavBadgeDisplay; context: string }) {
  if (!display) return null
  if (display.kind === 'unknown') {
    return (
      <>
        <span
          aria-hidden="true"
          title="Count unavailable"
          data-admin-nav-badge="unknown"
          className="ml-auto inline-flex min-w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-slate-400"
        >
          –
        </span>
        <span className="sr-only">({context}: count unavailable)</span>
      </>
    )
  }
  const { value } = display
  return (
    <>
      <span
        aria-hidden="true"
        data-admin-nav-badge={value}
        className={cn(
          'ml-auto inline-flex min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums',
          value > 0 ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500',
        )}
      >
        {value > 999 ? '999+' : value}
      </span>
      <span className="sr-only">({value} open {value === 1 ? 'task' : 'tasks'})</span>
    </>
  )
}

const linkClass = (current: boolean, inSection: boolean) =>
  cn(
    'flex min-w-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1',
    current
      ? 'bg-indigo-600 font-semibold text-white'
      : inSection
        ? 'font-semibold text-indigo-700 hover:bg-indigo-50'
        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
  )

/**
 * The admin menu: document-ordered groups, only the items this admin may
 * open, one current destination, counters only where the document asks.
 */
export function AdminNavigationMenu({
  groups,
  active,
  badges,
  idPrefix = 'admin-nav',
  homeCurrent = false,
  onNavigate,
}: {
  groups: readonly AdminNavGroup[]
  active: AdminNavActive
  badges: AdminNavBadgeSnapshot
  idPrefix?: string
  homeCurrent?: boolean
  onNavigate?: () => void
}) {
  return (
    <nav aria-label="Admin" className="space-y-5">
      <Link
        href={ADMIN_HOME_HREF}
        onClick={onNavigate}
        aria-current={homeCurrent ? 'page' : undefined}
        className={cn(
          'block rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
          homeCurrent ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-800',
        )}
      >
        Admin panel
      </Link>
      {groups.map((group) => {
        const headingId = `${idPrefix}-${group.id}`
        return (
          <section key={group.id} aria-labelledby={headingId} data-admin-nav-group={group.id}>
            <h2 id={headingId} className="flex items-center gap-2 px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className="min-w-0 truncate">{group.label}</span>
              <AdminNavBadge display={groupBadgeDisplay(group, badges)} context={`${group.label} total`} />
            </h2>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const inSection = active.itemId === item.id
                const current = inSection && active.childId === null
                const showChildren = inSection && (item.children?.length ?? 0) > 0
                return (
                  <li key={item.id} data-admin-nav-item={item.id}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={current ? 'page' : undefined}
                      className={linkClass(current, inSection && !current)}
                    >
                      <span className="min-w-0 truncate">{item.label}</span>
                      <AdminNavBadge display={itemBadgeDisplay(item, badges)} context={item.label} />
                    </Link>
                    {showChildren && (
                      <ul className="mt-0.5 space-y-0.5 border-l border-slate-200 pl-2 ml-4" aria-label={`${item.label} pages`}>
                        {item.children!.map((child) => {
                          const childCurrent = active.childId === child.id
                          return (
                            <li key={child.id} data-admin-nav-child={child.id}>
                              <Link
                                href={child.href}
                                onClick={onNavigate}
                                aria-current={childCurrent ? 'page' : undefined}
                                className={cn(linkClass(childCurrent, false), 'py-1 text-[13px]')}
                              >
                                <span className="min-w-0 truncate">{child.label}</span>
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </nav>
  )
}
