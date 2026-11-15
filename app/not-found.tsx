import { SITE_NAME } from "@/lib/seo/site";

/**
 * Unknown non-page paths (middleware routes every page path into `app/[ctx]`,
 * whose localized not-found page handles those). Renders its own document
 * because the root layout does not.
 */
export default function RootNotFound() {
  return (
    <html lang="en">
      <body className="antialiased">
        <main className="flex min-h-screen items-center justify-center px-4">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-[#4032f7]">404</p>
            <h1 className="mt-3 text-2xl font-bold text-gray-900">This page could not be found.</h1>
            {/* A full page load: the home page renders its own document (app/[ctx]). */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="mt-6 inline-block text-[#4032f7] underline">
              {SITE_NAME}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
