"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { X, Upload } from "lucide-react";

interface ChatComposerProps {
  disabled?: boolean;
  sending?: boolean;
  onSend: (payload: { text: string; files: File[] }) => Promise<void>;
}

export default function ChatComposer({ disabled, sending, onSend }: ChatComposerProps) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const canSend = useMemo(() => {
    return !disabled && !sending && (text.trim().length > 0 || files.length > 0);
  }, [disabled, sending, text, files.length]);

  const onPickFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    if (selected.length === 0) return;

    setFiles((prev) => {
      const combined = [...prev, ...selected];
      return combined.slice(0, 5);
    });

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
  };

  const handleSubmit = async () => {
    if (!canSend) return;
    try {
      await onSend({ text, files });
      setText("");
      setFiles([]);
    } catch {
      // Keep current draft and attachments when send fails.
    }
  };

  return (
    <div className="border-t border-slate-200 bg-white p-3 space-y-3">
      <Textarea
        placeholder="Type a message..."
        rows={3}
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={disabled || sending}
      />

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs"
            >
              <span className="max-w-40 truncate">{file.name}</span>
              <button type="button" onClick={() => removeFile(index)} aria-label="Remove image">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            multiple
            className="hidden"
            onChange={onPickFiles}
            disabled={disabled || sending}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || sending || files.length >= 5}
          >
            <Upload className="mr-2 h-4 w-4" />
            Add Images
          </Button>
        </div>

        <Button type="button" onClick={handleSubmit} disabled={!canSend}>
          {sending ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
}
