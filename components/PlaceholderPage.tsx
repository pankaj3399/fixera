// In components/PlaceholderPage.tsx
'use client'

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const PlaceholderPage = ({ title, description }: { title: string; description?: string }) => {
  const t = useTranslations('home');

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-center px-4">
      <h1 className="text-5xl font-bold text-gray-800">{title}</h1>
      <p className="mt-4 text-xl text-gray-600 max-w-xl">
        {description || t('placeholderPage.description')}
      </p>
      <div className="mt-8">
        <Button asChild>
          <Link href="/">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('placeholderPage.backHome')}
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default PlaceholderPage;
