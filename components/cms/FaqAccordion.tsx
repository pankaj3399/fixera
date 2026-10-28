"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import RichTextRenderer from "./RichTextRenderer";
import { FaqGroup } from "@/lib/cms";

/**
 * FAQ group names come from the backend's hardcoded FAQ_CATEGORIES list, so the
 * public labels are translated here by category slug (unknown slugs fall back
 * to the backend name).
 */
const FAQ_CATEGORY_KEYS = {
  general: "faq.categories.general",
  booking: "faq.categories.booking",
  "payments-invoicing": "faq.categories.paymentsInvoicing",
  "warranty-disputes": "faq.categories.warrantyDisputes",
  professionals: "faq.categories.professionals",
  account: "faq.categories.account",
} as const;

function faqCategoryKey(slug: string) {
  return FAQ_CATEGORY_KEYS[slug as keyof typeof FAQ_CATEGORY_KEYS];
}

interface Props {
  groups: FaqGroup[];
}

export default function FaqAccordion({ groups }: Props) {
  const t = useTranslations("content");

  return (
    <div className="space-y-8">
      {groups.map((group) => {
        const categoryKey = faqCategoryKey(group.slug);
        return (
          <section key={group.slug} id={group.slug} className="space-y-4">
            <div className="rounded-2xl bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-[1.5px] shadow-md shadow-rose-100">
              <div className="rounded-[calc(1rem-1.5px)] bg-white px-6 py-3">
                <h2 className="bg-gradient-to-r from-rose-600 to-pink-500 bg-clip-text text-xl font-bold text-transparent">
                  {categoryKey ? t(categoryKey) : group.name}
                </h2>
                <p className="text-xs text-rose-500">
                  {t("faq.questionCount", { count: group.items.length })}
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {group.items.map((item) => (
                <FaqItem key={item._id} anchor={`${group.slug}-${item.slug}`} title={item.title} body={item.body} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function FaqItem({ anchor, title, body }: { anchor: string; title: string; body: string }) {
  const [open, setOpen] = useState(false);
  const reactId = useId();
  const buttonId = `faq-btn-${reactId}`;
  const panelId = `faq-panel-${reactId}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => {
      if (window.location.hash === `#${anchor}`) setOpen(true);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [anchor]);

  return (
    <div id={anchor} className="scroll-mt-24 rounded-2xl bg-gradient-to-br from-rose-100 via-pink-100 to-orange-100 p-[1.5px] transition hover:from-rose-200 hover:via-pink-200 hover:to-orange-200 hover:shadow-md hover:shadow-rose-100">
      <div className="rounded-[calc(1rem-1.5px)] bg-white">
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-[calc(1rem-1.5px)] px-5 py-4 text-left transition",
            open ? "bg-gradient-to-r from-rose-50 to-pink-50" : "hover:bg-rose-50/50"
          )}
        >
          <span className="font-semibold text-rose-900">{title}</span>
          <ChevronDown
            size={18}
            className={cn("flex-shrink-0 text-rose-500 transition-transform", open && "rotate-180")}
          />
        </button>
        {open && (
          <div
            id={panelId}
            role="region"
            aria-labelledby={buttonId}
            className="border-t border-pink-100 px-5 py-4"
          >
            <RichTextRenderer html={body} className="prose-sm" />
          </div>
        )}
      </div>
    </div>
  );
}
