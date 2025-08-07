import ProfessionalsHero from '@/components/professionals-page/ProfessionalsHero';
import EarningDashboard from '@/components/professionals-page/EarningDashboard';
import FaqPro from '@/components/professionals-page/FaqPro';
import FeaturesSection from '@/components/FeaturesSection';

export default function ProfessionalsPage() {
    return (
        <div>
            <ProfessionalsHero />
            <EarningDashboard />
            <FeaturesSection /> 
            <FaqPro />
        </div>
    );
}