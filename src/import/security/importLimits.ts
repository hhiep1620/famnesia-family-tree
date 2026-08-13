export const IMPORT_LIMITS = {
  jsonBytes: 10 * 1024 * 1024,
  excelBytes: 20 * 1024 * 1024,
  decompressedBytes: 120 * 1024 * 1024,
  zipEntries: 2_000,
  worksheets: 12,
  rowsPerSheet: 20_001,
  columnsPerSheet: 40,
  cells: 500_000,
  persons: 20_000,
  relationships: 50_000,
  media: 50_000,
} as const
