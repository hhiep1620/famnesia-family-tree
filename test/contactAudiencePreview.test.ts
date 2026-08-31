import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('CR-07 contact audience preview UI', () => {
  it('shows all normative audiences, affinal warning and explicit allow/deny controls', () => {
    const source = readFileSync(new URL('../src/components/privacy/ContactAudiencePreview.tsx', import.meta.url), 'utf8')
    for (const audience of ['self_only','direct_family','close_blood','blood_only','workspace_members','custom']) expect(source).toContain(audience)
    expect(source).toContain('Ai sẽ được xem?')
    expect(source).toContain('họ hàng bên vợ/chồng')
    expect(source).toContain('Cho phép rõ ràng')
    expect(source).toContain('Từ chối rõ ràng')
  })
})
