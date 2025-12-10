const QUALITY_CERTIFICATIONS = ['ISO', 'EN', 'VCA', 'BREEAM', 'LEED', 'DGNB'] as const;

export type QualityCertificateKey = typeof QUALITY_CERTIFICATIONS[number];

const CERTIFICATE_GRADIENTS: Record<QualityCertificateKey, string> = {
  ISO: 'from-indigo-500 to-blue-500',
  EN: 'from-emerald-500 to-teal-400',
  VCA: 'from-amber-500 to-orange-500',
  BREEAM: 'from-green-600 to-lime-500',
  LEED: 'from-slate-700 to-slate-500',
  DGNB: 'from-purple-600 to-pink-500',
};

const DEFAULT_GRADIENT = 'from-gray-600 to-gray-500';

const normalizeCertificateName = (name?: string | null) => {
  if (!name) return '';
  return name.trim().toUpperCase();
};

export const resolveQualityCertificate = (name?: string | null): QualityCertificateKey | null => {
  const normalized = normalizeCertificateName(name);
  if (!normalized) return null;
  const match = QUALITY_CERTIFICATIONS.find((qualityName) => normalized.includes(qualityName));
  return match ?? null;
};

export const isQualityCertificate = (name?: string | null): boolean => {
  return resolveQualityCertificate(name) !== null;
};

export const getCertificateGradient = (name?: string | null): string => {
  const key = resolveQualityCertificate(name);
  if (!key) return DEFAULT_GRADIENT;
  return CERTIFICATE_GRADIENTS[key] || DEFAULT_GRADIENT;
};

export const formatPriceModelLabel = (value?: string | null): string => {
  if (!value) return '';
  return value
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
};

export { QUALITY_CERTIFICATIONS };
