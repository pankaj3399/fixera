'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function EditProjectRedirect() {
  const router = useRouter();
  const params = useParams();
  const t = useTranslations('proProjects');

  useEffect(() => {
    const id = params?.id;
    if (id) {
      const query = new URLSearchParams({ id: String(id) });
      router.replace(`/projects/create?${query.toString()}`);
    } else {
      // No project id available — redirect to projects list
      const timer = setTimeout(() => {
        router.replace('/projects');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">{t('editRedirect.redirecting')}</p>
    </div>
  );
}
