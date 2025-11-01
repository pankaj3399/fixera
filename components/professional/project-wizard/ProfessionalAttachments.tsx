'use client'

 
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, Trash2, FileText, Loader2 } from "lucide-react";
import { toast } from 'sonner';
import { useFileUpload } from "@/hooks/useFileUpload";

interface ProfessionalAttachmentsProps {
  attachments: string[];
  onChange: (attachments: string[]) => void;
  questionId: string;
  projectId?: string;
  label?: string;
}

export default function ProfessionalAttachments({
  attachments,
  onChange,
  questionId,
  projectId,
  label = "Upload Supporting Documents"
}: ProfessionalAttachmentsProps) {
  const { uploadFile, uploading, progress } = useFileUpload();

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File must be less than 10MB');
      return;
    }

    const result = await uploadFile(file, 'attachment', {
      projectId,
      questionId
    });

    if (result) {
      onChange([...attachments, result.url]);
      toast.success('File uploaded successfully');
    } else {
      toast.error('Failed to upload file');
    }
  };

  const removeAttachment = (url: string) => {
    onChange(attachments.filter(a => a !== url));
    toast.success('File removed');
  };

  const getFileName = (url: string) => {
    return url.split('/').pop() || 'file';
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{label}</Label>

      {/* Upload Button */}
      <div>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          id={`attachment-${questionId}`}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
          }}
          disabled={uploading}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => document.getElementById(`attachment-${questionId}`)?.click()}
          disabled={uploading}
          className="w-full"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Uploading... {progress}%
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Upload File (PDF, Image, Word)
            </>
          )}
        </Button>
      </div>

      {/* Uploaded Files List */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-gray-600">
            Uploaded Files ({attachments.length})
          </Label>
          {attachments.map((url, index) => (
            <div
              key={index}
              className="flex items-center justify-between bg-gray-50 p-3 rounded border"
            >
              <div className="flex items-center space-x-2 flex-1 min-w-0">
                <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {getFileName(url)}
                  </p>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View file
                  </a>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeAttachment(url)}
                className="text-red-500 flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Upload documents that help answer this question (max 10MB per file)
      </p>
    </div>
  );
}
