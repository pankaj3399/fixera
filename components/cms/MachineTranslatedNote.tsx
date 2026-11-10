import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small notice on public CMS pages whose served document is a machine
 * translation (`autoTranslated === true` on the public payload). `label` is a
 * public i18n message (content.machineTranslatedNote) in the visitor's locale.
 * Renders nothing for originals, manual translations and English fallbacks.
 */
export default function MachineTranslatedNote({
  autoTranslated,
  label,
  className,
}: {
  autoTranslated: boolean | undefined;
  label: string;
  className?: string;
}) {
  if (autoTranslated !== true) return null;
  return (
    <p
      data-testid="cms-machine-translated"
      className={cn("flex items-center gap-1.5 text-xs text-rose-500", className)}
    >
      <Languages size={12} aria-hidden className="shrink-0" />
      {label}
    </p>
  );
}
