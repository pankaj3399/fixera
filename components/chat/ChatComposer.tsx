"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { X, Paperclip, FileText, Video, ImageIcon, CornerUpRight, Loader2 } from "lucide-react";
import type { ChatMessage } from "@/types/chat";

interface ChatComposerProps {
  disabled?: boolean;
  sending?: boolean;
  replyTo?: ChatMessage | null;
  onCancelReply?: () => void;
  onSend: (payload: { text: string; files: File[]; replyTo?: string }) => Promise<void>;
}

const getReplyName = (message: ChatMessage) => {
  const sender = message.senderId as unknown;
  if (sender && typeof sender === "object") {
    const s = sender as { name?: string; username?: string; businessInfo?: { companyName?: string } };
    return s.username || s.name || "User";
  }
  return "User";
};

export default function ChatComposer({ disabled, sending, replyTo, onCancelReply, onSend }: ChatComposerProps) {
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
      await onSend({ text, files, replyTo: replyTo?._id });
      setText("");
      setFiles([]);
    } catch {
      // Keep current draft and attachments when send fails.
    }
  };

  return (
    <div className="border-t border-slate-200 bg-white p-3 space-y-2 shrink-0">
      {/* Reply-to preview */}
      {replyTo && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
          <CornerUpRight className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-indigo-600">{getReplyName(replyTo)}</p>
            <p className="text-xs text-gray-500 truncate">
              {replyTo.text?.slice(0, 100) || (replyTo.images?.length ? "[Image]" : "[Attachment]")}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="p-0.5 rounded hover:bg-gray-200"
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5 text-gray-400" />
          </button>
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => {
            const isImage = file.type.startsWith("image/");
            const isVideo = file.type.startsWith("video/");
            const FileIcon = isImage ? ImageIcon : isVideo ? Video : FileText;

            return (
              <div
                key={`${file.name}-${index}`}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs"
              >
                <FileIcon className="h-3 w-3 shrink-0 text-gray-500" />
                <span className="max-w-40 truncate">{file.name}</span>
                <button type="button" onClick={() => removeFile(index)} aria-label="Remove file">
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,video/mp4,video/quicktime"
          multiple
          className="hidden"
          onChange={onPickFiles}
          disabled={disabled || sending}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-gray-500 hover:text-indigo-600"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || sending || files.length >= 5}
          aria-label="Attach file"
        >
          <Paperclip className="h-5 w-5" />
        </Button>
        <Textarea
          placeholder="Type a message..."
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSubmit();
            }
          }}
          disabled={disabled || sending}
          className="resize-none flex-1 min-h-[36px] max-h-[80px]"
        />
        <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={handleSubmit} disabled={!canSend} aria-label="Send message">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CornerUpRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
