import { useState } from 'react';

interface UploadProgress {
  uploading: boolean;
  progress: number;
  error: string | null;
}

interface UploadResult {
  url: string;
  key: string;
}

export const useFileUpload = () => {
  const [state, setState] = useState<UploadProgress>({
    uploading: false,
    progress: 0,
    error: null
  });

  const uploadFile = async (
    file: File,
    type: 'image' | 'video' | 'certification' | 'attachment',
    additionalData?: { projectId?: string; certificationType?: string; questionId?: string }
  ): Promise<UploadResult | null> => {
    setState({ uploading: true, progress: 0, error: null });

    try {
      const formData = new FormData();
      formData.append(type, file);

      if (additionalData) {
        Object.entries(additionalData).forEach(([key, value]) => {
          if (value) formData.append(key, value);
        });
      }

      const xhr = new XMLHttpRequest();

      // Progress tracking
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded * 100) / e.total);
          setState(prev => ({ ...prev, progress }));
        }
      });

      // Response handling
      const response = await new Promise<any>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.response));
          } else {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        };
        xhr.onerror = () => reject(new Error('Network error'));

        xhr.open('POST', `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/projects/upload/${type}`);
        xhr.withCredentials = true;
        xhr.send(formData);
      });

      if (response.success) {
        setState({ uploading: false, progress: 100, error: null });
        return response.data;
      } else {
        throw new Error(response.message || 'Upload failed');
      }
    } catch (error: any) {
      setState({ uploading: false, progress: 0, error: error.message });
      return null;
    }
  };

  const reset = () => {
    setState({ uploading: false, progress: 0, error: null });
  };

  return { ...state, uploadFile, reset };
};
