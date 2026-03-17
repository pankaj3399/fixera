import { useState, useEffect, useCallback } from 'react'

export function useCommissionRate() {
  const [commissionPercent, setCommissionPercent] = useState<number>(0)

  useEffect(() => {
    const controller = new AbortController()

    const fetchCommission = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/commission-rate`,
          { credentials: 'include', signal: controller.signal }
        )
        if (res.ok) {
          const json = await res.json()
          setCommissionPercent(json?.data?.commissionPercent ?? 0)
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        console.error('Failed to fetch commission rate:', error)
      }
    }

    fetchCommission()
    return () => controller.abort()
  }, [])

  const customerPrice = useCallback(
    (amount: number) => {
      if (!commissionPercent || !amount) return amount
      return +(amount * (1 + commissionPercent / 100)).toFixed(2)
    },
    [commissionPercent]
  )

  return { commissionPercent, customerPrice }
}
