import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { noindexMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projects");
  return noindexMetadata("/projects/create", t("meta.createTitle"));
}

export default function CreateProjectLayout({ children }: { children: React.ReactNode }) {
  return children;
}
