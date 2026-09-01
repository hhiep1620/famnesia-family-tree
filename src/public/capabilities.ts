export type CapabilityState = 'available' | 'beta' | 'planned'
export const PUBLIC_CAPABILITIES = {
  privacyPerPerson: 'beta',
  VietnameseKinship: 'available',
  familyCalendar: 'available',
  collaboration: 'beta',
  portability: 'available',
  bubbleExplorer: 'planned',
} as const satisfies Record<string, CapabilityState>
