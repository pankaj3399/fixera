'use client'

import React from 'react';
import { iconMap } from '@/data/content';

export type IconName = keyof typeof iconMap;

const Icon = ({ name, className }: { name: IconName; className?: string }) => {
  const LucideIcon = iconMap[name];
  if (!LucideIcon) {
    return null;
  }
  return <LucideIcon className={className} />;
};

export default Icon;