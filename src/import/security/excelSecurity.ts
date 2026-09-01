import { IMPORT_LIMITS } from './importLimits.js'

const BLOCKED_ENTRY = /(^|\/)(vbaProject\.bin|externalLinks|connections\.xml|embeddings|oleObjects|activeX)(\/|$)/i

export interface ZipInspection { entries: string[]; compressedBytes: number; decompressedBytes: number }

function u16(view: DataView, offset: number): number { return view.getUint16(offset, true) }
function u32(view: DataView, offset: number): number { return view.getUint32(offset, true) }

export function inspectXlsxContainer(bytes: Uint8Array): { inspection?: ZipInspection; errors: string[] } {
  if (bytes.byteLength < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    return { errors: ['File content is not a valid XLSX Open XML workbook.'] }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()
  let eocd = -1
  for (let offset = bytes.byteLength - 22; offset >= Math.max(0, bytes.byteLength - 65_557); offset -= 1) {
    if (u32(view, offset) === 0x06054b50) { eocd = offset; break }
  }
  if (eocd < 0) return { errors: ['Potentially unsafe workbook content detected.'] }
  const entryCount = u16(view, eocd + 10)
  const directorySize = u32(view, eocd + 12)
  const directoryOffset = u32(view, eocd + 16)
  if (entryCount > IMPORT_LIMITS.zipEntries || directoryOffset + directorySize > bytes.byteLength) {
    return { errors: ['Workbook is too complex to process safely.'] }
  }
  const entries: string[] = []
  let compressedBytes = 0
  let decompressedBytes = 0
  let cursor = directoryOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.byteLength || u32(view, cursor) !== 0x02014b50) return { errors: ['Potentially unsafe workbook content detected.'] }
    const compressed = u32(view, cursor + 20)
    const decompressed = u32(view, cursor + 24)
    const filenameLength = u16(view, cursor + 28)
    const extraLength = u16(view, cursor + 30)
    const commentLength = u16(view, cursor + 32)
    const filename = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + filenameLength))
    if (filename.includes('..') || filename.startsWith('/') || filename.includes('\\')) return { errors: ['Potentially unsafe workbook content detected.'] }
    entries.push(filename)
    compressedBytes += compressed
    decompressedBytes += decompressed
    cursor += 46 + filenameLength + extraLength + commentLength
  }
  if (!entries.includes('[Content_Types].xml') || !entries.some((entry) => /^xl\/workbook\.xml$/i.test(entry))) return { errors: ['File content is not a valid XLSX Open XML workbook.'] }
  if (entries.some((entry) => BLOCKED_ENTRY.test(entry))) return { errors: ['Potentially unsafe workbook content detected. Macros, external links and embedded objects are blocked.'] }
  if (decompressedBytes > IMPORT_LIMITS.decompressedBytes || (compressedBytes > 0 && decompressedBytes / compressedBytes > 150)) {
    return { errors: ['Workbook is too complex to process safely.'] }
  }
  const worksheets = entries.filter((entry) => /^xl\/worksheets\/[^/]+\.xml$/i.test(entry)).length
  if (worksheets > IMPORT_LIMITS.worksheets) return { errors: ['Workbook has too many worksheets.'] }
  return { inspection: { entries, compressedBytes, decompressedBytes }, errors: [] }
}
