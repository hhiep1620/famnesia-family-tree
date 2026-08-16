import type { PersonMedia } from '../types/family'

/** Returns the opaque key consumed by the selected media repository. */
export function mediaReferenceId(media: PersonMedia | undefined): string | undefined {
  return media?.fileId || media?.driveFileId
}
