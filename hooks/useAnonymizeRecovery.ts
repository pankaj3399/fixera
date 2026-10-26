"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { AnonymizeRecoveryRecord } from "@/lib/adminAnonymize"
import {
  ANONYMIZE_RECOVERY_LIST_LIMIT,
  requestAnonymizeRecoveryList,
} from "@/lib/adminAnonymize"
import {
  purgeLegacyAnonymizeRecoveryStorage,
  readAnonymizeRecoveryRecords,
  writeAnonymizeRecoveryRecords,
} from "@/lib/anonymizeRecoveryStorage"

export type AnonymizeRecoverySync = "idle" | "loading" | "synced" | "unavailable"

export interface AnonymizeRecoveryListMeta {
  page: number
  totalPages: number
  /** All recoverable accounts the server knows about. */
  total: number
  /** Server accounts loaded across pages so far, excluding local fallback. */
  shown: number
  /** True when the server exposes page/totalPages paging. */
  paged: boolean
}

function mergeInitialPage(
  previous: AnonymizeRecoveryRecord[],
  server: AnonymizeRecoveryRecord[],
  complete: boolean,
  currentChanged: boolean,
): AnonymizeRecoveryRecord[] {
  const serverIds = new Set(server.map((entry) => entry.targetId))
  const localOnly = previous.filter((entry) => {
    if (entry.source !== "session" || serverIds.has(entry.targetId)) return false
    // A status-unknown record is local evidence that an execute outcome was
    // not observed. Keep it until the admin checks the authoritative preview.
    // Incomplete paging cannot prove an unseen local target is stale either.
    return currentChanged || entry.state === "status_unknown" || !complete
  })
  return [...server, ...localOnly]
}

/**
 * Keep a partial-cleanup recovery card across ordinary list refreshes, even
 * though the server intentionally hides anonymized accounts from that list.
 *
 * The server recovery query is the cross-browser source of truth. The local
 * record is scoped to the signed-in administrator, contains only the target
 * id, role, state, identity flags and cleanup counts, and is used as a fallback
 * when the server query is unavailable or the outcome is still unknown.
 */
export function useAnonymizeRecovery(
  scope: string,
  adminId: string | null | undefined,
  enabled = true,
) {
  const [entries, setEntriesState] = useState<AnonymizeRecoveryRecord[]>([])
  const [sync, setSync] = useState<AnonymizeRecoverySync>("idle")
  const [listMeta, setListMeta] = useState<AnonymizeRecoveryListMeta | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const mutationVersionRef = useRef(0)
  const generationRef = useRef(0)
  const loadMoreControllerRef = useRef<AbortController | null>(null)
  const loadingMoreRef = useRef(false)
  const loadedServerIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    generationRef.current += 1
    const generation = generationRef.current
    loadMoreControllerRef.current?.abort()
    loadMoreControllerRef.current = null
    loadingMoreRef.current = false
    setLoadingMore(false)
    setLoadMoreError(null)
    loadedServerIdsRef.current = new Set()

    if (typeof window === "undefined" || !adminId || !enabled) {
      setEntriesState([])
      setListMeta(null)
      setSync("idle")
      return
    }
    purgeLegacyAnonymizeRecoveryStorage(window.sessionStorage)
    const local = readAnonymizeRecoveryRecords(window.sessionStorage, adminId, scope)
    setEntriesState(local)
    setListMeta(null)
    setSync("loading")
    const controller = new AbortController()
    const startedAtVersion = mutationVersionRef.current

    void requestAnonymizeRecoveryList({
      signal: controller.signal,
      page: 1,
      limit: ANONYMIZE_RECOVERY_LIST_LIMIT,
    }).then((response) => {
      if (controller.signal.aborted || generationRef.current !== generation) return
      if (!response.ok) {
        if (response.error.kind !== "canceled") setSync("unavailable")
        return
      }
      const server = response.data.accounts
      const totalPages = response.data.totalPages
      const paged = totalPages !== null
      const complete = !paged || totalPages <= 1
      loadedServerIdsRef.current = new Set(server.map((entry) => entry.targetId))
      setListMeta({
        page: response.data.page,
        totalPages: totalPages ?? 1,
        total: response.data.total,
        shown: loadedServerIdsRef.current.size,
        paged,
      })
      setEntriesState((current) => {
        const merged = mergeInitialPage(
          current,
          server,
          complete,
          mutationVersionRef.current !== startedAtVersion,
        )
        writeAnonymizeRecoveryRecords(window.sessionStorage, adminId, scope, merged)
        return merged
      })
      setSync("synced")
    })

    return () => {
      controller.abort()
      loadMoreControllerRef.current?.abort()
    }
  }, [adminId, enabled, reloadVersion, scope])

  const setEntries = useCallback(
    (
      update:
        | AnonymizeRecoveryRecord[]
        | ((previous: AnonymizeRecoveryRecord[]) => AnonymizeRecoveryRecord[]),
    ) => {
      mutationVersionRef.current += 1
      if (!adminId) {
        setEntriesState((previous) => (typeof update === "function" ? update(previous) : update))
        return
      }
      setEntriesState((previous) => {
        const next = typeof update === "function" ? update(previous) : update
        if (typeof window !== "undefined") {
          writeAnonymizeRecoveryRecords(window.sessionStorage, adminId, scope, next)
        }
        return next
      })
    },
    [adminId, scope],
  )

  /** Reload the authoritative first page without mutating any account. */
  const retry = useCallback(() => {
    setReloadVersion((previous) => previous + 1)
  }, [])

  /** Load the next authoritative page and append it to the card. */
  const loadMore = useCallback(() => {
    if (
      !adminId ||
      !enabled ||
      !listMeta?.paged ||
      listMeta.page >= listMeta.totalPages ||
      loadingMoreRef.current
    ) {
      return
    }
    const nextPage = listMeta.page + 1
    const generation = generationRef.current
    const startedAtVersion = mutationVersionRef.current
    loadMoreControllerRef.current?.abort()
    const controller = new AbortController()
    loadMoreControllerRef.current = controller
    loadingMoreRef.current = true
    setLoadingMore(true)
    setLoadMoreError(null)

    void requestAnonymizeRecoveryList({
      signal: controller.signal,
      page: nextPage,
      limit: ANONYMIZE_RECOVERY_LIST_LIMIT,
    }).then((response) => {
      if (controller.signal.aborted || generationRef.current !== generation) return
      if (!response.ok) {
        if (response.error.kind !== "canceled") {
          setLoadMoreError(response.error.message)
        }
        return
      }
      const server = response.data.accounts
      for (const entry of server) loadedServerIdsRef.current.add(entry.targetId)
      const totalPages = response.data.totalPages ?? listMeta.totalPages
      const page = response.data.page || nextPage
      const complete = response.data.totalPages !== null && page >= totalPages
      setListMeta({
        page,
        totalPages,
        total: response.data.total,
        shown: loadedServerIdsRef.current.size,
        paged: response.data.totalPages !== null,
      })
      setEntriesState((previous) => {
        const byId = new Map(previous.map((entry) => [entry.targetId, entry]))
        for (const entry of server) byId.set(entry.targetId, entry)
        let next = Array.from(byId.values())
        if (complete) {
          const currentChanged = mutationVersionRef.current !== startedAtVersion
          next = next.filter((entry) => {
            if (entry.source === "server") return true
            if (entry.state === "status_unknown") return true
            return currentChanged && !loadedServerIdsRef.current.has(entry.targetId)
          })
        }
        writeAnonymizeRecoveryRecords(window.sessionStorage, adminId, scope, next)
        return next
      })
    }).finally(() => {
      if (generationRef.current === generation && !controller.signal.aborted) {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    })
  }, [adminId, enabled, listMeta, scope])

  return {
    entries,
    setEntries,
    sync,
    retry,
    listMeta,
    loadMore,
    loadingMore,
    loadMoreError,
  }
}
