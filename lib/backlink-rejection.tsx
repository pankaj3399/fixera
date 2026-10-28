import { Globe } from 'lucide-react';

export function formatIsoDatesInMessage(message: string, locale?: string): string {
  return message.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  });
}

export function summarizeRejectionReason(
  reason: string,
  noLinkSummary = 'No Fixtract link was found on this page'
): {
  summary: string;
  expandable: boolean;
  full: string;
} {
  const full = reason.trim();
  const noLinkMatch = full.match(/^No link to (.+) was found on the page$/i);
  if (noLinkMatch) {
    const domains = noLinkMatch[1].split(/\s+or\s+/i).map((d) => d.trim()).filter(Boolean);
    if (domains.length > 1) {
      return {
        summary: noLinkSummary,
        expandable: true,
        full,
      };
    }
  }
  if (full.length > 100) {
    return { summary: `${full.slice(0, 97)}…`, expandable: true, full };
  }
  return { summary: full, expandable: false, full };
}

export function parseRejectionReason(reason: string, locale?: string):
  | { type: 'no_link'; domains: string[] }
  | { type: 'text'; text: string } {
  const full = reason.trim();
  const noLinkMatch = full.match(/^No link to (.+) was found on the page$/i);
  if (noLinkMatch) {
    const domains = [
      ...new Set(noLinkMatch[1].split(/\s+or\s+/i).map((d) => d.trim()).filter(Boolean)),
    ];
    return { type: 'no_link', domains };
  }
  return { type: 'text', text: formatIsoDatesInMessage(full, locale) };
}

export interface RejectionTooltipLabels {
  title?: string;
  hint?: string;
}

export function RejectionTooltipBody({
  reason,
  locale,
  labels,
}: {
  reason: string;
  locale?: string;
  labels?: RejectionTooltipLabels;
}) {
  const parsed = parseRejectionReason(reason, locale);
  const title = labels?.title ?? 'No Fixtract link on page';
  const hint = labels?.hint ?? 'The page must include a link to one of these domains:';

  if (parsed.type === 'no_link') {
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-red-900">{title}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
        <ul className="scrollbar-thin max-h-36 space-y-1 overflow-y-auto overscroll-y-contain pr-1">
          {parsed.domains.map((domain) => (
            <li
              key={domain}
              className="flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1 font-mono text-[11px] leading-tight text-red-900"
            >
              <Globe className="h-3 w-3 shrink-0 text-red-400" aria-hidden />
              <span className="min-w-0 truncate">{domain}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return <p className="text-xs leading-relaxed text-foreground">{parsed.text}</p>;
}
