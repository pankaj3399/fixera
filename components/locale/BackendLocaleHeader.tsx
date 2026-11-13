"use client";

import { useEffect } from "react";
import { installBackendLocaleHeader } from "@/lib/i18n/backendLocale";

// Install as early as possible (module evaluation in the browser) so requests
// fired by effects lower in the tree already carry the language hint.
installBackendLocaleHeader();

/**
 * Makes API validation/business messages follow the UI language: every
 * request to the API carries `Accept-Language` = `<html lang>` (en/nl/fr).
 */
export default function BackendLocaleHeader() {
  useEffect(() => {
    installBackendLocaleHeader();
  }, []);
  return null;
}
