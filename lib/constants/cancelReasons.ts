export const CANCEL_REASONS = [
  { value: 'no_show', label: "Professional didn't show up (No-show)" },
  { value: 'not_as_described', label: 'Service not as described in booking/chat' },
  { value: 'extra_payment_requested', label: 'Professional requested extra payment not agreed upon' },
  { value: 'poor_communication', label: 'Poor communication / unresponsive professional' },
  { value: 'no_longer_needed', label: 'I no longer need the service or booked by mistake' },
  { value: 'found_alternative', label: 'Found a better or cheaper alternative' },
  { value: 'requirements_changed', label: 'Project requirements changed significantly' },
  { value: 'scheduling_conflict', label: 'Scheduling conflict' },
  { value: 'trust_concerns', label: 'Safety, quality or trust concerns' },
  { value: 'other', label: 'Other' },
] as const

export type CancelReasonValue = (typeof CANCEL_REASONS)[number]['value']
