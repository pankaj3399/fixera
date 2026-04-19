import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Join Fixera as a Professional",
  description:
    "Grow your business with Fixera — join our network of verified professionals and connect with customers looking for quality home services.",
  path: "/join",
});

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
