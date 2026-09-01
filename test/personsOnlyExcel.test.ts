import { describe, expect, it } from 'vitest'
import * as XLSX from '@e965/xlsx'
import { normalizePersonsOnlyWorkbook, resolvePersonReference, PERSONS_ONLY_HEADERS } from '../src/import/personsOnlyExcel'

describe('CR-16 persons-only Excel staging', () => {
  it('accepts Vietnamese headers and marks relationship rows for confirmation', () => {
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Hướng dẫn']]), 'Hướng dẫn'); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([PERSONS_ONLY_HEADERS, ['', 'Nguyễn An', '', 'Nam', '1990', '', 'Không', '', '', '', '', '', '', '', '', '', 'Không', '']]), 'Danh sách người')
    const rows = normalizePersonsOnlyWorkbook(new Uint8Array(XLSX.write(book, { bookType: 'xlsx', type: 'array' })))
    expect(rows[0]).toMatchObject({ status: 'ready', values: { 'Họ và tên': 'Nguyễn An' } })
  })
  it('does not fuzzy-select ambiguous references', () => {
    const rows = [{ row: 2, values: { 'Họ và tên': 'An', 'Mã người': 'P1' }, status: 'ready', messages: [] }, { row: 3, values: { 'Họ và tên': 'An', 'Mã người': 'P2' }, status: 'ready', messages: [] }] as const
    expect(resolvePersonReference('An', [...rows], [])).toEqual({ candidates: ['P1', 'P2'] })
  })
})
