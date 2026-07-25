"use client";

import { useEffect, useState } from "react";
import { hasAnalyticsConsent } from "@/lib/analytics";
import { CONSENT_EVENT } from "@/lib/consent";

/** True once the visitor has granted analytics cookies. */
export function useAnalyticsConsentFlag(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const refresh = () => setOk(hasAnalyticsConsent());
    refresh();
    window.addEventListener(CONSENT_EVENT, refresh);
    return () => window.removeEventListener(CONSENT_EVENT, refresh);
  }, []);
  return ok;
}
