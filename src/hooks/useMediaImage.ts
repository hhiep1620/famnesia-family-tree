import { useEffect, useState } from 'react'
import { authenticatedApiFetch } from '../services/apiClient'

export type MediaImageVariant = 'original' | 'thumb'

/** Resolve private media through the selected authenticated backend. */
export function useMediaImage(workspaceId?: string, mediaId?: string, variant: MediaImageVariant = 'original') {
  const [url, setUrl] = useState<string>()
  const [loading, setLoading] = useState(Boolean(workspaceId && mediaId))

  useEffect(() => {
    let active = true
    let objectUrl: string | undefined
    if (!workspaceId || !mediaId) {
      setUrl(undefined)
      setLoading(false)
      return () => { active = false }
    }

    setUrl(undefined)
    setLoading(true)
    const path = `/api/workspaces/${encodeURIComponent(workspaceId)}/photos/${encodeURIComponent(mediaId)}?variant=${variant}`
    void authenticatedApiFetch(path, { headers: { Accept: 'image/*' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Media request failed with ${response.status}.`)
        objectUrl = URL.createObjectURL(await response.blob())
        if (active) setUrl(objectUrl)
      })
      .catch(() => { if (active) setUrl(undefined) })
      .finally(() => { if (active) setLoading(false) })

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [mediaId, variant, workspaceId])

  return { url, loading }
}
