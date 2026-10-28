'use client'

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Trash2, FileText, AlertCircle } from "lucide-react";
import { toast } from 'sonner';
import { useFileUpload } from "@/hooks/useFileUpload";

interface ICertification {
  name: string;
  fileUrl: string;
  uploadedAt: Date;
  isRequired: boolean;
}

interface CertificationManagerProps {
  certifications: ICertification[];
  onChange: (certifications: ICertification[]) => void;
  required: boolean;
  projectId?: string;
  requiredTypes?: string[];
}

const CERTIFICATION_TYPES = [
  'ISO', 'EN', 'VCA', 'BREEAM', 'LEED', 'DGNB',
  'Architect', 'Demolition', 'EPC', 'Asbestos',
  'Gas & Oil', 'Electric', 'Waste Transport', 'Pest Control'
];

const DISPLAY_AS_TAG = ['ISO', 'EN', 'VCA', 'BREEAM', 'LEED', 'DGNB'];

// Display labels only — the stored certification `name` stays the raw type so it
// keeps matching the backend's requiredCertifications.
const CERTIFICATION_TYPE_KEYS = {
  'ISO': 'certifications.types.iso',
  'EN': 'certifications.types.en',
  'VCA': 'certifications.types.vca',
  'BREEAM': 'certifications.types.breeam',
  'LEED': 'certifications.types.leed',
  'DGNB': 'certifications.types.dgnb',
  'Architect': 'certifications.types.architect',
  'Demolition': 'certifications.types.demolition',
  'EPC': 'certifications.types.epc',
  'Asbestos': 'certifications.types.asbestos',
  'Gas & Oil': 'certifications.types.gasOil',
  'Electric': 'certifications.types.electric',
  'Waste Transport': 'certifications.types.wasteTransport',
  'Pest Control': 'certifications.types.pestControl',
} as const;

export default function CertificationManager({
  certifications,
  onChange,
  required,
  projectId,
  requiredTypes = []
}: CertificationManagerProps) {
  const t = useTranslations('projectWizard')
  const certificationTypeLabel = (type: string) => {
    const key = CERTIFICATION_TYPE_KEYS[type as keyof typeof CERTIFICATION_TYPE_KEYS]
    return key ? t(key) : type
  }
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    certifications.map(c => c.name)
  );
  const { uploadFile, uploading, progress } = useFileUpload();

  const toggleCertificationType = (type: string) => {
    if (selectedTypes.includes(type)) {
      // Remove certification
      setSelectedTypes(selectedTypes.filter(t => t !== type));
      onChange(certifications.filter(c => c.name !== type));
    } else {
      // Add certification type
      setSelectedTypes([...selectedTypes, type]);
    }
  };

  const handleFileUpload = async (type: string, file: File) => {
    if (!file) return;

    // Validate file
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('certifications.toast.tooLarge'));
      return;
    }

    try {
      const result = await uploadFile(file, 'certification', {
        projectId,
        certificationType: type
      });

      if (result && result.url) {
        const newCertification: ICertification = {
          name: type,
          fileUrl: result.url,
          uploadedAt: new Date(),
          isRequired: required
        };

        // Update or add certification
        const existingIndex = certifications.findIndex(c => c.name === type);
        if (existingIndex >= 0) {
          const updated = [...certifications];
          updated[existingIndex] = newCertification;
          onChange(updated);
        } else {
          onChange([...certifications, newCertification]);
        }

        toast.success(t('certifications.toast.uploaded', { type: certificationTypeLabel(type) }));
      } else {
        console.error('Certification upload failed - no result URL returned');
        toast.error(t('certifications.toast.uploadFailedConnection', { type: certificationTypeLabel(type) }));
      }
    } catch (error) {
      console.error('Certification upload error:', error);
      const message = error instanceof Error
        ? error.message
        : t('certifications.toast.uploadFailed', { type: certificationTypeLabel(type) });
      toast.error(message);
    }
  };

  const removeCertification = (type: string) => {
    setSelectedTypes(selectedTypes.filter(t => t !== type));
    onChange(certifications.filter(c => c.name !== type));
  };

  const getCertificationFile = (type: string) => {
    return certifications.find(c => c.name === type);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{t('certifications.title')}</span>
          {(required || (requiredTypes && requiredTypes.length > 0)) && (
            <Badge variant="destructive" className="text-xs">
              {requiredTypes && requiredTypes.length > 0
                ? t('certifications.requiredWithTypes', { types: requiredTypes.map(certificationTypeLabel).join(', ') })
                : t('certifications.required')}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {t('certifications.description')}
          {DISPLAY_AS_TAG.some(type => selectedTypes.includes(type)) && (
            <span className="block mt-2 text-blue-600">
              {t('certifications.displayedAsTags', { types: DISPLAY_AS_TAG.filter(type => selectedTypes.includes(type)).join(', ') })}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {required && certifications.length === 0 && (
          <div className="flex items-center space-x-2 text-amber-600 bg-amber-50 p-3 rounded-lg">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">
              {t('certifications.requiresOne')}
            </span>
          </div>
        )}

        {/* Certification Type Selection */}
        <div>
          <Label className="text-sm font-medium mb-3 block">
            {t('certifications.selectTypes')}
          </Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {CERTIFICATION_TYPES.map(type => (
              <div
                key={type}
                className="flex items-center space-x-2 p-2 border rounded cursor-pointer hover:bg-gray-50"
                onClick={() => toggleCertificationType(type)}
              >
                <Checkbox
                  checked={selectedTypes.includes(type)}
                  onCheckedChange={() => toggleCertificationType(type)}
                />
                <Label className="cursor-pointer text-sm flex-1">
                  {certificationTypeLabel(type)}
                </Label>
                {requiredTypes.includes(type) && (
                  <Badge variant="outline" className="text-[10px]">{t('certifications.required')}</Badge>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Upload Section for Selected Types */}
        {selectedTypes.length > 0 && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">{t('certifications.uploadTitle')}</Label>
            {selectedTypes.map(type => {
              const cert = getCertificationFile(type);
              return (
                <div key={type} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{certificationTypeLabel(type)}</span>
                    {DISPLAY_AS_TAG.includes(type) && (
                      <Badge variant="outline" className="text-xs">
                        {t('certifications.willShowAsTag')}
                      </Badge>
                    )}
                  </div>

                  {cert ? (
                    <div className="flex items-center justify-between bg-green-50 p-3 rounded">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-green-600" />
                        <div>
                          <p className="text-sm font-medium text-green-900">
                            {t('certifications.uploaded')}
                          </p>
                          <a
                            href={cert.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-green-600 hover:underline"
                          >
                            {t('certifications.view')}
                          </a>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCertification(type)}
                        className="text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        id={`cert-${type}`}
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(type, file);
                        }}
                        disabled={uploading}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById(`cert-${type}`)?.click()}
                        disabled={uploading}
                        className="w-full"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {uploading ? t('certifications.uploading', { progress }) : t('certifications.upload')}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
