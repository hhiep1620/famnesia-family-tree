const MAX_EDGE = 2048
const MAX_SOURCE_SIZE = 2 * 1024 * 1024

export async function optimizePhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= MAX_SOURCE_SIZE || typeof createImageBitmap !== 'function') return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) { bitmap.close(); return file }
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86))
  if (!blob || blob.size >= file.size) return file
  const base = file.name.replace(/\.[^.]+$/, '')
  return new File([blob], `${base}.webp`, { type: 'image/webp', lastModified: file.lastModified })
}
