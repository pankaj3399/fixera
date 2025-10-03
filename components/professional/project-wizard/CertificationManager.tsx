'use client'

import { useState } from 'react';
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
}

const CERTIFICATION_TYPES = [
  'ISO', 'EN', 'VCA', 'BREEAM', 'LEED', 'DGNB',
  'Architect', 'Demolition', 'EPC', 'Asbestos',
  'Gas & Oil', 'Electric', 'Waste Transport', 'Pest Control'
];

const DISPLAY_AS_TAG = ['ISO', 'EN', 'VCA', 'BREEAM', 'LEED', 'DGNB'];

export default function CertificationManager({
  certifications,
  onChange,
  required,
  projectId
}: CertificationManagerProps) {
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
      toast.error('File must be less than 10MB');
      return;
    }

    const result = await uploadFile(file, 'certification', {
      projectId,
      certificationType: type
    });

    if (result) {
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

      toast.success(`${type} certification uploaded`);
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
          <span>Certifications</span>
          {required && (
            <Badge variant="destructive" className="text-xs">Required</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Select your certifications and upload proof documents
          {DISPLAY_AS_TAG.some(t => selectedTypes.includes(t)) && (
            <span className="block mt-2 text-blue-600">
              {DISPLAY_AS_TAG.filter(t => selectedTypes.includes(t)).join(', ')} will be displayed as tags to customers
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {required && certifications.length === 0 && (
          <div className="flex items-center space-x-2 text-amber-600 bg-amber-50 p-3 rounded-lg">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">
              This service requires at least one certification
            </span>
          </div>
        )}

        {/* Certification Type Selection */}
        <div>
          <Label className="text-sm font-medium mb-3 block">
            Select Certification Types
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
                  {type}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Upload Section for Selected Types */}
        {selectedTypes.length > 0 && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Upload Certification Documents</Label>
            {selectedTypes.map(type => {
              const cert = getCertificationFile(type);
              return (
                <div key={type} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{type}</span>
                    {DISPLAY_AS_TAG.includes(type) && (
                      <Badge variant="outline" className="text-xs">
                        Will show as tag
                      </Badge>
                    )}
                  </div>

                  {cert ? (
                    <div className="flex items-center justify-between bg-green-50 p-3 rounded">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-green-600" />
                        <div>
                          <p className="text-sm font-medium text-green-900">
                            Uploaded
                          </p>
                          <a
                            href={cert.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-green-600 hover:underline"
                          >
                            View certificate
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
                        {uploading ? `Uploading... ${progress}%` : 'Upload Certificate'}
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
