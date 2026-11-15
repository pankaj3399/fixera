import "./globals.css";

/**
 * Pages render their document in `app/[ctx]/layout.tsx`, which knows the
 * request's language (lib/routeContext.ts). This root only exists for the
 * plain 404 below, served for paths middleware does not route to a page.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
