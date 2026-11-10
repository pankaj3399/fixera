"use client"

import { useCallback, useEffect, useRef, useState } from "react";
import {
  adminGetCmsTranslationStatus,
  cmsTranslationInFlight,
  type CmsTranslationStatus,
} from "@/lib/cms";
import { createCmsTranslationPoller, documentVisibility, type CmsTranslationPoller } from "@/lib/cmsTranslationPoller";

export type CmsTranslationLoadState = "idle" | "loading" | "ready" | "error";
/** idle: nothing pending · polling · timed_out: gave up (~2 min) · stopped: a 4xx ended polling. */
export type CmsTranslationPollPhase = "idle" | "polling" | "timed_out" | "stopped";

export interface CmsTranslationStatusHandle {
  status: CmsTranslationStatus | undefined;
  loadState: CmsTranslationLoadState;
  phase: CmsTranslationPollPhase;
  /** After a save/retry: show its status and poll while anything is pending. */
  track(status: CmsTranslationStatus | undefined, options: { expectWork: boolean }): void;
  /** "Check again" after a timeout or a failed load. */
  refresh(): void;
}

/**
 * Translation status of the document `docId` belongs to, polled while a
 * background run is pending. `onSettled` runs once a run observed by this
 * screen finished (to flush the public cache, reload links, etc.). Polling
 * stops on unmount.
 */
export function useCmsTranslationStatus(
  docId: string | undefined,
  initial: CmsTranslationStatus | undefined,
  onSettled: (status: CmsTranslationStatus) => void
): CmsTranslationStatusHandle {
  const [status, setStatus] = useState<CmsTranslationStatus | undefined>(initial);
  const [loadState, setLoadState] = useState<CmsTranslationLoadState>(
    initial ? "ready" : docId ? "loading" : "idle"
  );
  const [phase, setPhase] = useState<CmsTranslationPollPhase>("idle");
  const onSettledRef = useRef(onSettled);
  const pollerRef = useRef<CmsTranslationPoller | null>(null);
  const initialRef = useRef(initial);

  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    if (!docId) return;
    const poller = createCmsTranslationPoller({
      fetchStatus: (signal) => adminGetCmsTranslationStatus(docId, { signal }),
      onStatus: (next) => {
        setStatus(next);
        setLoadState("ready");
      },
      onSettled: (next, { observedWork }) => {
        setPhase("idle");
        if (observedWork) onSettledRef.current(next);
      },
      onTimeout: () => {
        setPhase("timed_out");
        setLoadState((prev) => (prev === "ready" ? prev : "error"));
      },
      onFatal: () => {
        setPhase("stopped");
        setLoadState((prev) => (prev === "ready" ? prev : "error"));
      },
      visibility: documentVisibility(),
    });
    pollerRef.current = poller;
    const first = initialRef.current;
    if (!first || cmsTranslationInFlight(first)) {
      setPhase("polling");
      poller.start(first);
    }
    return () => {
      poller.dispose();
      pollerRef.current = null;
    };
  }, [docId]);

  const track = useCallback((next: CmsTranslationStatus | undefined, options: { expectWork: boolean }) => {
    if (next) {
      setStatus(next);
      setLoadState("ready");
    }
    const poller = pollerRef.current;
    if (!poller) return;
    if (cmsTranslationInFlight(next) || (!next && options.expectWork)) {
      setPhase("polling");
      poller.start(next, { expectWork: options.expectWork });
    } else {
      poller.stop();
      setPhase("idle");
    }
  }, []);

  const refresh = useCallback(() => {
    const poller = pollerRef.current;
    if (!poller) return;
    setPhase("polling");
    setLoadState((prev) => (prev === "ready" ? prev : "loading"));
    poller.start(undefined, { expectWork: true });
  }, []);

  return { status, loadState, phase, track, refresh };
}
