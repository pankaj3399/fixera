import type { Metadata } from 'next';
import ProfessionalsHero from '@/components/professionals-page/ProfessionalsHero';
import EarningDashboard from '@/components/professionals-page/EarningDashboard';
import FaqPro from '@/components/professionals-page/FaqPro';
import FeaturesSection from '@/components/FeaturesSection';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbSchema } from '@/lib/seo/jsonLd';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildMetadata({
    title: 'Become a Fixera Professional',
    description: 'Join Fixera as a verified professional. Grow your business, earn more, and connect with customers across your area.',
    path: '/professionals',
});

export default function ProfessionalsPage() {
    return (
        <div>
            <JsonLd data={breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Professionals', path: '/professionals' }])} />
            <ProfessionalsHero />
            <EarningDashboard />
            <FeaturesSection />
            <FaqPro />
        </div>
    );
}