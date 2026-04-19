"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { adminUploadCmsImage } from "@/lib/cms";
import { cn } from "@/lib/utils";

interface Props {
  value?: string;
  onChange: (url: string | undefined) => void;
  required?: boolean;
}

export default function CoverImageUpload({ value, onChange, required }: Props) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await adminUploadCmsImage(file);
      onChange(url);
      toast.success("Cover image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-rose-900">
          Cover Image {required && <span className="text-rose-500">*</span>}
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
          >
            <X size={12} /> Remove
          </button>
        )}
      </div>
      <div
        className={cn(
          "relative rounded-2xl bg-gradient-to-br from-rose-100 via-pink-100 to-orange-100 p-[1.5px] transition-all",
          !value && "hover:from-rose-200 hover:via-pink-200 hover:to-orange-200"
        )}
      >
        <div className="rounded-[calc(1rem-1.5px)] bg-white">
          {value ? (
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[calc(1rem-1.5px)]">
              <Image src={value} alt="Cover" fill className="object-cover" unoptimized />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-[calc(1rem-1.5px)] bg-gradient-to-br from-rose-50 via-pink-50 to-white text-rose-700 transition hover:from-rose-100 hover:via-pink-100 hover:to-rose-50"
            >
              {uploading ? (
                <Loader2 className="animate-spin" size={24} />
              ) : (
                <>
                  <ImagePlus size={28} className="text-rose-500" />
                  <span className="text-sm font-medium">Click to upload cover image</span>
                  <span className="text-xs text-rose-400">JPEG, PNG, or WebP — up to 5MB</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
      {value && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-rose-100 to-pink-100 px-3 py-1.5 text-xs font-medium text-rose-700 hover:from-rose-200 hover:to-pink-200"
        >
          {uploading ? <Loader2 className="animate-spin" size={12} /> : <ImagePlus size={12} />} Replace image
        </button>
      )}
    </div>
  );
}
