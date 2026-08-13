import { describe, expect, it } from 'vitest'
import { expiredMirrorHistoryFileIds, MIRROR_SNAPSHOT_LIMIT } from '../api/_server/mirror'

describe('Drive mirror snapshot retention', () => {
  it('keeps the newest 20 JSON/manifest snapshot pairs', () => {
    const files = Array.from({ length: 23 }, (_, snapshot) => ['family', 'manifest'].map((kind) => ({
      id: `${snapshot}-${kind}`,
      createdTime: new Date(Date.UTC(2026, 7, snapshot + 1)).toISOString(),
      appProperties: { resourceType: `mirror-history-${kind}`, generation: String(snapshot) },
    }))).flat()
    files.push({ id: 'manual-note', createdTime: '2020-01-01T00:00:00.000Z', appProperties: { resourceType: 'user-file' } })

    const expired = expiredMirrorHistoryFileIds(files)
    expect(MIRROR_SNAPSHOT_LIMIT).toBe(20)
    expect(expired).toHaveLength(6)
    expect(new Set(expired)).toEqual(new Set(['0-family', '0-manifest', '1-family', '1-manifest', '2-family', '2-manifest']))
    expect(expired).not.toContain('manual-note')
  })
})
