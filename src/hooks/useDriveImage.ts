import { useEffect, useState } from 'react'
import { authenticatedApiFetch } from '../services/apiClient'

/**
 * Resolve private media through the active authentication adapter. Blob URLs
 * let Supabase Bearer sessions and legacy Drive cookie sessions share the same
 * image components without exposing access tokens in image URLs.
 */
export function useDriveImage(workspaceId?: string, fileId?: string) {
  const [url, setUrl] = useState<string>()
  const [loading, setLoading] = useState(Boolean(workspaceId && fileId))

  useEffect(() => {
    let active = true
    let objectUrl: string | undefined
    if (!workspaceId || !fileId) {
      setUrl(undefined)
      setLoading(false)
      return () => { active = false }
    }

    setUrl(undefined)
    setLoading(true)
    void authenticatedApiFetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/photos/${encodeURIComponent(fileId)}`, { headers: { Accept: 'image/*' } })
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
  }, [workspaceId, fileId])

  return { url, loading }
}
