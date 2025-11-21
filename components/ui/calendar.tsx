'use client'

import { format } from 'date-fns'
import React from 'react'

export interface CalendarProps {
  mode?: 'single' | 'range'
  selected?: Date
  onSelect?: (date: Date | undefined) => void
  disabled?: (date: Date) => boolean
  initialFocus?: boolean
}

const Calendar = ({
  selected,
  onSelect,
  disabled,
  initialFocus = false,
}: CalendarProps) => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target
    if (!value) {
      onSelect?.(undefined)
      return
    }
    const date = new Date(value)
    if (disabled?.(date)) {
      return
    }
    onSelect?.(date)
  }

  return (
    <input
      type="date"
      value={selected ? format(selected, 'yyyy-MM-dd') : ''}
      onChange={handleChange}
      autoFocus={initialFocus}
      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  )
}

export default Calendar
