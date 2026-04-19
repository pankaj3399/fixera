import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = noindexMetadata("/chat", "Chat");

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
