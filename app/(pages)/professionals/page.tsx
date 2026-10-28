import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import ProfessionalsHero from '@/components/professionals-page/ProfessionalsHero';
import EarningDashboard from '@/components/professionals-page/EarningDashboard';
import FaqPro from '@/components/professionals-page/FaqPro';
import FeaturesSection from '@/components/FeaturesSection';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbSchema } from '@/lib/seo/jsonLd';
import { buildMetadata } from '@/lib/seo/metadata';

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('search');
    return buildMetadata({
        title: t('meta.professionalsTitle'),
        description: t('meta.professionalsDescription'),
        path: '/professionals',
    });
}

export default async function ProfessionalsPage() {
    const t = await getTranslations('search');
    return (
        <div>
            <JsonLd data={breadcrumbSchema([{ name: t('meta.breadcrumbHome'), path: '/' }, { name: t('meta.breadcrumbProfessionals'), path: '/professionals' }])} />
            <ProfessionalsHero />
            <EarningDashboard />
            <FeaturesSection />
            <FaqPro />
        </div>
    );
}
