"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "";

function errMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function UnsubscribeInner() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";
  const subscriberToken = searchParams.get("subscriberToken") || "";
  const hasParams = Boolean(token || (email && subscriberToken));

  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const paramsKey = `${token}:${email}:${subscriberToken}`;
  const paramsKeyRef = useRef(paramsKey);

  useEffect(() => {
    paramsKeyRef.current = paramsKey;
    requestRef.current?.abort();
    requestRef.current = null;
    setStatus("idle");
    setMessage("");
    return () => requestRef.current?.abort();
  }, [paramsKey]);

  const runUnsubscribe = async () => {
    if (status === "loading") return;
    if (!API_BASE) {
      setMessage(t("unsubscribe.serverNotConfigured"));
      setStatus("error");
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const requestParamsKey = paramsKey;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    setStatus("loading");
    try {
      const res = await fetch(`${API_BASE}/api/public/marketing/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, subscriberToken }),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.msg || t("unsubscribe.failed"));
      }
      if (requestParamsKey === paramsKeyRef.current) {
        setMessage(json.data?.message || t("unsubscribe.unsubscribed"));
        setStatus("done");
      }
    } catch (e: unknown) {
      if (requestParamsKey === paramsKeyRef.current) {
        const aborted = e instanceof DOMException && e.name === "AbortError";
        setMessage(aborted ? t("unsubscribe.timeout") : errMessage(e, t("unsubscribe.failed")));
        setStatus("error");
      }
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) requestRef.current = null;
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t("unsubscribe.title")}</CardTitle>
        <CardDescription>{t("unsubscribe.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "idle" && !hasParams && (
          <>
            <p className="text-sm text-muted-foreground">
              {t("unsubscribe.noParams")}
            </p>
            <Button asChild>
              <Link href="/profile?tab=notifications">{t("unsubscribe.openSettings")}</Link>
            </Button>
          </>
        )}
        {status === "idle" && hasParams && (
          <>
            <p className="text-sm text-muted-foreground">
              {t("unsubscribe.confirm")}
            </p>
            <Button onClick={runUnsubscribe}>{t("unsubscribe.submit")}</Button>
          </>
        )}
        {status === "loading" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("unsubscribe.unsubscribing")}
          </div>
        )}
        {status === "done" && <p className="text-sm text-emerald-700">{message}</p>}
        {status === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-rose-600">{message}</p>
            <Button variant="outline" onClick={runUnsubscribe}>
              {t("unsubscribe.tryAgain")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function UnsubscribePage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <Suspense fallback={<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}>
        <UnsubscribeInner />
      </Suspense>
    </div>
  );
}
