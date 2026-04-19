"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { useCallback, useEffect } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Image as ImageIcon,
  Undo,
  Redo,
  Minus,
} from "lucide-react";
import { toast } from "sonner";
import { adminUploadCmsImage } from "@/lib/cms";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
      Image.configure({ HTMLAttributes: { class: "rounded-xl my-4 max-w-full h-auto" } }),
      Placeholder.configure({ placeholder: placeholder || "Start writing..." }),
    ],
    content: value || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-pink max-w-none min-h-[360px] p-5 focus:outline-none prose-headings:text-rose-900 prose-a:text-pink-600 prose-strong:text-rose-900",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", prev || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const insertImage = useCallback(async () => {
    if (!editor) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        toast.loading("Uploading image...", { id: "cms-img" });
        const { url } = await adminUploadCmsImage(file);
        editor.chain().focus().setImage({ src: url, alt: file.name }).run();
        toast.success("Image inserted", { id: "cms-img" });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed", { id: "cms-img" });
      }
    };
    input.click();
  }, [editor]);

  if (!editor) {
    return (
      <div className="rounded-2xl border border-pink-200 bg-gradient-to-br from-rose-50 via-pink-50 to-white p-5 text-sm text-rose-400">
        Loading editor...
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-rose-100 via-pink-100 to-orange-100 p-[1.5px] shadow-sm">
      <div className="rounded-[calc(1rem-1.5px)] bg-white">
        <div className="flex flex-wrap items-center gap-1 border-b border-pink-100 bg-gradient-to-r from-rose-50 via-pink-50 to-white p-2 rounded-t-[calc(1rem-1.5px)]">
          <ToolbarBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1"><Heading1 size={16} /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2"><Heading2 size={16} /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3"><Heading3 size={16} /></ToolbarBtn>
          <Divider />
          <ToolbarBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold"><Bold size={16} /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic"><Italic size={16} /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline"><UnderlineIcon size={16} /></ToolbarBtn>
          <Divider />
          <ToolbarBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list"><List size={16} /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list"><ListOrdered size={16} /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote"><Quote size={16} /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code block"><Code size={16} /></ToolbarBtn>
          <Divider />
          <ToolbarBtn active={editor.isActive("link")} onClick={setLink} title="Link"><LinkIcon size={16} /></ToolbarBtn>
          <ToolbarBtn onClick={insertImage} title="Insert image"><ImageIcon size={16} /></ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider"><Minus size={16} /></ToolbarBtn>
          <Divider />
          <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} title="Undo"><Undo size={16} /></ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} title="Redo"><Redo size={16} /></ToolbarBtn>
        </div>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-700 transition-all",
        "hover:bg-gradient-to-br hover:from-rose-200 hover:to-pink-200 hover:shadow-sm hover:scale-105",
        active && "bg-gradient-to-br from-rose-300 to-pink-300 text-rose-900 shadow-inner"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-pink-200" />;
}
