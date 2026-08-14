const MAX_EDGE = 2048
const MAX_SOURCE_SIZE = 2 * 1024 * 1024
const THUMB_EDGE = 384

async function renderWebp(file: File, maxEdge: number, quality: number): Promise<File | undefined> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return undefined
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) { bitmap.close(); return undefined }
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
  if (!blob) return undefined
  const base = file.name.replace(/\.[^.]+$/, '')
  return new File([blob], `${base}.webp`, { type: 'image/webp', lastModified: file.lastModified })
}

export async function optimizePhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= MAX_SOURCE_SIZE || typeof createImageBitmap !== 'function') return file
  const optimized = await renderWebp(file, MAX_EDGE, 0.86)
  return optimized && optimized.size < file.size ? optimized : file
}

export async function createPhotoThumbnail(file: File): Promise<File> {
  return await renderWebp(file, THUMB_EDGE, 0.78) ?? file
}
