export type FamilyRepositoryMode = 'legacy' | 'encrypted-synthetic' | 'disabled'

export function parseFamilyRepositoryMode(value: string | undefined): FamilyRepositoryMode {
  if (!value || value === 'legacy') return 'legacy'
  if (value === 'encrypted-synthetic' || value === 'disabled') return value
  throw new Error('INVALID_FAMILY_REPOSITORY_MODE')
}

export function assertLegacyFamilyPathEnabled(value: string | undefined): void {
  const mode = parseFamilyRepositoryMode(value)
  if (mode !== 'legacy') throw new Error(mode === 'disabled' ? 'FAMILY_REPOSITORY_DISABLED' : 'LEGACY_PLAINTEXT_PATH_DISABLED')
}
