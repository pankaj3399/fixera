'use client'
import React from 'react';
import { useTranslations } from 'next-intl';
import { teamMembers } from '@/data/content';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from '@/components/ui/card';

/** Role labels live in the `content` namespace, in the same order as the data. */
const TEAM_ROLE_KEYS = ['alex', 'jasmine', 'leo', 'sofia'] as const;

const TeamSection = () => {
  const t = useTranslations('content');

  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900">{t('about.team.title')}</h2>
          <p className="mt-4 text-lg text-gray-600">{t('about.team.description')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {teamMembers.map((member, index) => {
            const key = TEAM_ROLE_KEYS[index] ?? TEAM_ROLE_KEYS[0]
            return (
              <Card key={member.name} className="text-center border-0 shadow-lg hover:shadow-xl transition-shadow">
                <CardContent className="p-6">
                  <Avatar className="w-32 h-32 mx-auto mb-4 ring-4 ring-blue-100">
                    <AvatarImage src={member.image} alt={member.name} />
                    <AvatarFallback>{member.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                  </Avatar>
                  <h3 className="text-xl font-semibold text-gray-900">{member.name}</h3>
                  <p className="text-blue-600 font-medium">{t(`about.team.roles.${key}`)}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
export default TeamSection;
