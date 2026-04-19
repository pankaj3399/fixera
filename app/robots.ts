import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/*",
          "/profile",
          "/profile/*",
          "/dashboard",
          "/dashboard/*",
          "/bookings",
          "/bookings/*",
          "/chat",
          "/chat/*",
          "/login",
          "/signup",
          "/forgot-password",
          "/reset-password",
          "/api/*",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
