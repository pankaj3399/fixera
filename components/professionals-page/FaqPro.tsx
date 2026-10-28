'use client'
import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ_KEYS = ['payment', 'fees', 'chooseProjects', 'manageBusiness'] as const;

const FaqPro = () => {
  const t = useTranslations('search');

  return (
    <section className="py-24 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900">{t('prosPage.faq.title')}</h2>
            <p className="mt-4 text-lg text-gray-600">
                {t('prosPage.faq.description')}
            </p>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {FAQ_KEYS.map((key, index) => (
            <AccordionItem key={key} value={`item-${index + 1}`}>
              <AccordionTrigger className="text-lg font-medium text-left">{t(`prosPage.faq.items.${key}.question`)}</AccordionTrigger>
              <AccordionContent className="text-base text-gray-600">
                {t(`prosPage.faq.items.${key}.answer`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}

export default FaqPro;
