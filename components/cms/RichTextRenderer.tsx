import DOMPurify from "isomorphic-dompurify";
import { cn } from "@/lib/utils";

interface Props {
  html: string;
  className?: string;
}

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "strong", "em", "u", "s", "code", "pre",
  "ul", "ol", "li",
  "blockquote",
  "a", "img",
  "span", "div",
  "table", "thead", "tbody", "tr", "th", "td",
];

const ALLOWED_ATTR = ["href", "target", "rel", "src", "alt", "title", "class", "id", "loading"];

export default function RichTextRenderer({ html, className }: Props) {
  const clean = DOMPurify.sanitize(html || "", {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/|#)/i,
  });

  return (
    <div
      className={cn(
        "prose prose-pink max-w-none",
        "prose-headings:text-rose-900 prose-headings:font-bold",
        "prose-h1:bg-gradient-to-r prose-h1:from-rose-600 prose-h1:to-pink-500 prose-h1:bg-clip-text prose-h1:text-transparent",
        "prose-a:text-pink-600 prose-a:font-medium hover:prose-a:text-rose-700",
        "prose-strong:text-rose-900",
        "prose-blockquote:border-l-rose-300 prose-blockquote:bg-gradient-to-r prose-blockquote:from-rose-50 prose-blockquote:to-transparent prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded-r-xl",
        "prose-code:text-rose-700 prose-code:bg-rose-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded",
        "prose-img:rounded-2xl prose-img:shadow-md",
        "prose-li:marker:text-rose-400",
        "prose-hr:border-pink-200",
        className
      )}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
