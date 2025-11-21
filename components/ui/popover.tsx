'use client'

import React, { isValidElement, ReactElement } from 'react'

interface PopoverProps {
  children: React.ReactNode
}

interface PopoverTriggerProps {
  children: ReactElement
  asChild?: boolean
}

interface PopoverContentProps {
  children: React.ReactNode
  className?: string
}

export const Popover = ({ children }: PopoverProps) => {
  return <div className="relative inline-block">{children}</div>
}

export const PopoverTrigger = ({ children }: PopoverTriggerProps) => {
  if (!isValidElement(children)) {
    return null
  }
  return children
}

export const PopoverContent = ({ children, className }: PopoverContentProps) => {
  return (
    <div className={className}>
      {children}
    </div>
  )
}

export default Popover
