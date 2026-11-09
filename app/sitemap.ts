import type { MetadataRoute } from "next";
import { buildSitemapFile, planSitemapFiles } from "@/lib/server/sitemap";

/**
 * Rendered per request, not prerendered or ISR-cached. A file whose data could not be read
 * fails its response, so no partial sitemap is cached. Each backend read is cached by the
 * fetch layer on success, so a request costs little.
 */
export const dynamic = "force-dynamic";

/** The sitemap files the index lists: content files, then project and professional files. */
export async function generateSitemaps(): Promise<Array<{ id: number }>> {
  return (await planSitemapFiles()).files;
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  return buildSitemapFile(Number(id));
}
