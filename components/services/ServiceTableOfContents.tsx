'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { List } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TocItem } from '@/lib/cms/toc';

interface Props {
  items: TocItem[];
}

function measureStickyHeaderHeight(): number {
  const selectors = ['header', '[data-app-header]', 'nav[role="navigation"]'];
  const seen = new Set<HTMLElement>();
  let total = 0;
  const viewportHeight = window.innerHeight;
  for (const sel of selectors) {
    const nodes = document.querySelectorAll(sel);
    nodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (seen.has(node)) return;
      const rect = node.getBoundingClientRect();
      if (rect.height <= 0) return;
      const cs = getComputedStyle(node);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
      if (cs.bottom !== 'auto' && cs.top === 'auto') return;
      if (rect.bottom >= viewportHeight - 1) return;
      seen.add(node);
      total += rect.height;
    });
  }
  return total;
}

function smoothScrollTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const cssOffset = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--header-height')
  );
  const headerOffset =
    Number.isFinite(cssOffset) && cssOffset > 0 ? cssOffset : measureStickyHeaderHeight() || 80;
  const top = el.getBoundingClientRect().top + window.scrollY - headerOffset;
  const prefersReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  if (typeof history.replaceState === 'function') {
    history.replaceState(null, '', `#${id}`);
  } else if (typeof history.pushState === 'function') {
    history.pushState(null, '', `#${id}`);
  }
}

function LinkList({ items, className }: { items: TocItem[]; className?: string }) {
  return (
    <ul className={cn('space-y-2', className)}>
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            onClick={(e) => {
              if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              smoothScrollTo(item.id);
            }}
            className="block text-sm text-gray-600 hover:text-blue-600 transition-colors leading-snug"
          >
            {item.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function ServiceTableOfContents({ items }: Props) {
  const t = useTranslations('catalog');

  if (!items || items.length < 2) return null;

  return (
    <>
      <aside className="hidden lg:block">
        <div className="sticky top-24">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3 text-gray-900">
              <List className="w-4 h-4" />
              <h3 className="text-sm font-semibold uppercase tracking-wide">{t('tableOfContents.onThisPage')}</h3>
            </div>
            <LinkList items={items} />
          </div>
        </div>
      </aside>

      <details className="lg:hidden mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
        <summary className="flex items-center gap-2 cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-900">
          <List className="w-4 h-4" />
          {t('tableOfContents.onThisPage')}
          <span className="ml-auto text-xs font-normal text-gray-500">
            {t('tableOfContents.sections', { count: items.length })}
          </span>
        </summary>
        <div className="px-4 pb-4 pt-1">
          <LinkList items={items} />
        </div>
      </details>
    </>
  );
}
