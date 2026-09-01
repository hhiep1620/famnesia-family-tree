import { requireValidFamilyData } from '../schema/familyDataSchema.js'
import type { FamilyData, Person, Relationship } from '../types/family.js'
import type { PartialDate } from '../calendar/partialDate.js'

export interface GedcomDiagnostic { severity: 'error' | 'warning'; code: string; line?: number; message: string }
export interface GedcomIgnoredMedia { count: number; tags: string[] }
export interface GedcomParseResult { data?: FamilyData; diagnostics: GedcomDiagnostic[]; ignoredMedia: GedcomIgnoredMedia; version?: '5.5.1' | '7.0' }

interface Node { level: number; tag: string; xref?: string; value: string; children: Node[] }
const MAX_BYTES = 10 * 1024 * 1024
const MAX_RECORDS = 100_000
const MAX_DEPTH = 32
const MAX_LINE = 16 * 1024
const monthMap: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' }
const EMPTY_NODE: Node = { level: 0, tag: '', value: '', children: [] }

function child(node: Node | undefined, tag: string): Node | undefined { return node?.children.find((item) => item.tag === tag) }
function children(node: Node | undefined, tag: string): Node[] { return node?.children.filter((item) => item.tag === tag) ?? [] }
function text(node: Node | undefined): string | undefined { return node?.value.trim() || undefined }
function joined(node: Node): string { return node.children.filter((item) => item.tag === 'CONC' || item.tag === 'CONT').reduce((result, item) => result + (item.tag === 'CONT' ? `\n${item.value}` : item.value), node.value) }
function date(value: string | undefined): string | undefined {
  if (!value) return undefined
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim()); if (iso) return value.trim()
  const ged = /^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/i.exec(value.trim())
  return ged && monthMap[ged[2].toUpperCase()] ? `${ged[3]}-${monthMap[ged[2].toUpperCase()]}-${String(Number(ged[1])).padStart(2, '0')}` : undefined
}
function partialDate(value: string | undefined): PartialDate | null {
  if (!value) return null
  const input = value.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]), precision: 'day' }
  const full = /^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/i.exec(input)
  if (full && monthMap[full[2].toUpperCase()]) return { year: Number(full[3]), month: Number(monthMap[full[2].toUpperCase()]), day: Number(full[1]), precision: 'day' }
  const month = /^([A-Z]{3})\s+(\d{4})$/i.exec(input)
  if (month && monthMap[month[1].toUpperCase()]) return { year: Number(month[2]), month: Number(monthMap[month[1].toUpperCase()]), precision: 'month' }
  const year = /^(\d{4})$/.exec(input)
  return year ? { year: Number(year[1]), precision: 'year' } : null
}
function id(value: string | undefined, fallback: string): string { return value?.replace(/^@|@$/g, '') || fallback }
function parseLine(raw: string, line: number): { node?: Node; diagnostic?: GedcomDiagnostic } {
  if (raw.length > MAX_LINE) return { diagnostic: { severity: 'error', code: 'LINE_TOO_LONG', line, message: 'GEDCOM line exceeds 16 KiB.' } }
  const match = /^(\d+)(?:\s+(@[^@\s]+@))?\s+([A-Za-z0-9_]+)(?:\s(.*))?$/.exec(raw)
  if (!match) return { diagnostic: { severity: 'error', code: 'INVALID_LINE', line, message: 'Invalid GEDCOM line syntax.' } }
  const level = Number(match[1]); if (!Number.isSafeInteger(level) || level > MAX_DEPTH) return { diagnostic: { severity: 'error', code: 'DEPTH_LIMIT', line, message: 'GEDCOM nesting depth exceeds 32.' } }
  return { node: { level, xref: match[2], tag: match[3].toUpperCase(), value: match[4] ?? '', children: [] } }
}

function parseTree(textValue: string, diagnostics: GedcomDiagnostic[]): Node[] {
  const roots: Node[] = []; const stack: Node[] = []; let recordCount = 0
  const lines = textValue.replace(/^\uFEFF/, '').split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index] && index === lines.length - 1) continue
    const parsed = parseLine(lines[index], index + 1); if (parsed.diagnostic) { diagnostics.push(parsed.diagnostic); continue }
    const node = parsed.node!; if (node.level === 0) { roots.push(node); stack.length = 0; stack.push(node); recordCount += 1 }
    else {
      while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop()
      if (!stack.length || node.level > stack[stack.length - 1].level + 1) { diagnostics.push({ severity: 'error', code: 'INVALID_LEVEL', line: index + 1, message: 'GEDCOM level skips a parent.' }); continue }
      stack[stack.length - 1].children.push(node); stack.push(node)
    }
    if (recordCount > MAX_RECORDS) { diagnostics.push({ severity: 'error', code: 'RECORD_LIMIT', line: index + 1, message: 'GEDCOM record limit exceeded.' }); break }
  }
  return roots
}

function mapGedcom(roots: Node[], diagnostics: GedcomDiagnostic[]): FamilyData | undefined {
  const header = roots.find((node) => node.tag === 'HEAD'); const versionText = text(child(child(header ?? EMPTY_NODE, 'GEDC') ?? EMPTY_NODE, 'VERS'))
  const version = versionText?.startsWith('7') ? '7.0' : versionText?.startsWith('5.5.1') ? '5.5.1' : undefined
  if (!version) diagnostics.push({ severity: 'error', code: 'UNSUPPORTED_VERSION', message: 'GEDCOM version must be 5.5.1 or 7.0.' })
  const individuals = roots.filter((node) => node.tag === 'INDI'); const families = roots.filter((node) => node.tag === 'FAM')
  if (!individuals.length) { diagnostics.push({ severity: 'error', code: 'NO_INDIVIDUALS', message: 'GEDCOM contains no INDI records.' }); return undefined }
  const profileId = 'F_GEDCOM_1'; const persons: Person[] = []
  for (let index = 0; index < individuals.length; index += 1) {
    const node = individuals[index]; const personId = id(node.xref, `P_GEDCOM_${index + 1}`); const nameNode = child(node, 'NAME')
    const birthValue = text(child(child(node, 'BIRT') ?? EMPTY_NODE, 'DATE'))
    const person: Person = { id: personId, profileId, name: joined(nameNode ?? { ...EMPTY_NODE, value: `Unnamed ${index + 1}` }), nickname: text(child(node, 'NICK')) ?? '',
      gender: ({ M: 'male', F: 'female', U: 'unknown' } as Record<string, Person['gender']>)[(text(child(node, 'SEX')) ?? 'U').toUpperCase()] ?? 'other',
      birthDate: date(birthValue), birthDateParts: partialDate(birthValue), isDeceased: Boolean(child(node, 'DEAT')),
      deathDate: date(text(child(child(node, 'DEAT') ?? EMPTY_NODE, 'DATE'))), phone1: '', phone2: '', address: '', note: text(child(node, 'NOTE')) ?? '', ancestralRole: 'none' }
    persons.push(person)
  }
  const relationships: Relationship[] = []; let relationshipIndex = 0
  for (const family of families) {
    const spouses = [text(child(family, 'HUSB')), text(child(family, 'WIFE'))].filter(Boolean).map((value) => id(value, ''))
    if (spouses.length === 2) relationships.push({ id: `R_GEDCOM_${++relationshipIndex}`, profileId, person1Id: spouses[0], person2Id: spouses[1], type: 'spouse', status: text(child(child(family, 'DIV') ?? EMPTY_NODE, 'DATE')) ? 'divorced' : 'married', startDate: date(text(child(child(family, 'MARR') ?? EMPTY_NODE, 'DATE'))), endDate: date(text(child(child(family, 'DIV') ?? EMPTY_NODE, 'DATE'))) })
    for (const childNode of children(family, 'CHIL')) for (const parent of spouses) relationships.push({ id: `R_GEDCOM_${++relationshipIndex}`, profileId, person1Id: parent, person2Id: id(childNode.value, ''), type: 'parent' })
  }
  const known = new Set(persons.map((person) => person.id)); const validRelationships = relationships.filter((relationship) => known.has(relationship.person1Id) && known.has(relationship.person2Id))
  if (validRelationships.length !== relationships.length) diagnostics.push({ severity: 'warning', code: 'MISSING_REFERENCE', message: 'Some family references were omitted.' })
  const data: FamilyData = { schemaVersion: 3, updatedAt: new Date().toISOString(), profiles: [{ id: profileId, name: 'GEDCOM import', lineageSurname: '', description: '', photoFileId: null, subjectPersonId: persons[0].id, requiresSecret: false, isActive: true }], persons, relationships: validRelationships, media: [], settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' } }
  return requireValidFamilyData(data)
}

export function parseGedcomText(textValue: string, filename = 'family.ged'): GedcomParseResult {
  const diagnostics: GedcomDiagnostic[] = []; const bytes = new TextEncoder().encode(textValue).byteLength
  if (filename.toLowerCase().endsWith('.gdz')) return { diagnostics: [{ severity: 'error', code: 'GDZ_UNSUPPORTED', message: 'GEDZIP (.gdz) is not supported.' }], ignoredMedia: { count: 0, tags: [] } }
  if (bytes > MAX_BYTES) return { diagnostics: [{ severity: 'error', code: 'FILE_TOO_LARGE', message: 'GEDCOM file exceeds 10 MiB.' }], ignoredMedia: { count: 0, tags: [] } }
  const roots = parseTree(textValue, diagnostics); const ignored = roots.flatMap((root) => root.tag === 'INDI' || root.tag === 'FAM' ? root.children : []).filter((node) => ['OBJE','FILE','URL'].includes(node.tag))
  const data = mapGedcom(roots, diagnostics); const versionNode = roots.find((root) => root.tag === 'HEAD'); const versionText = text(child(child(versionNode ?? EMPTY_NODE, 'GEDC') ?? EMPTY_NODE, 'VERS'))
  return { data: diagnostics.some((item) => item.severity === 'error') ? undefined : data, diagnostics, version: versionText?.startsWith('7') ? '7.0' : versionText?.startsWith('5.5.1') ? '5.5.1' : undefined, ignoredMedia: { count: ignored.length, tags: [...new Set(ignored.map((node) => node.tag))] } }
}

function line(xref: string, level: number, tag: string, content?: string): string { return `${level} ${xref ? `${xref} ` : ''}${tag}${content ? ` ${content}` : ''}` }
function gedDate(value: string | null | undefined): string | undefined { if (!value) return undefined; const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (!match) return value; const months = Object.entries(monthMap); return `${match[3]} ${months.find(([, number]) => number === match[2])?.[0] ?? 'JAN'} ${match[1]}` }
function gedPartialDate(value: PartialDate | null | undefined): string | undefined { if (!value) return undefined; if (value.precision === 'year') return String(value.year); const month = Object.entries(monthMap).find(([, number]) => Number(number) === value.month)?.[0]; if (!month) return undefined; return value.precision === 'month' ? `${month} ${value.year}` : `${value.day} ${month} ${value.year}` }

export function serializeGedcom(data: FamilyData): string {
  const rows = [line('', 0, 'HEAD'), line('', 1, 'GEDC'), line('', 2, 'VERS', '7.0'), line('', 1, 'CHAR', 'UTF-8'), line('', 1, 'SOUR', 'Famnesia')]
  for (const person of data.persons) { rows.push(line(`@${person.id}@`, 0, 'INDI')); rows.push(line('', 1, 'NAME', person.name)); if (person.nickname) rows.push(line('', 1, 'NICK', person.nickname)); rows.push(line('', 1, 'SEX', person.gender === 'male' ? 'M' : person.gender === 'female' ? 'F' : 'U')); const birth = gedPartialDate(person.birthDateParts) ?? gedDate(person.birthDate); if (birth) rows.push(line('', 1, 'BIRT'), line('', 2, 'DATE', birth)); if (person.isDeceased) rows.push(line('', 1, 'DEAT'), ...(person.deathDate ? [line('', 2, 'DATE', gedDate(person.deathDate))] : [])); if (person.note) rows.push(line('', 1, 'NOTE', person.note)) }
  const spouse = data.relationships.filter((relationship) => relationship.type === 'spouse'); const parent = data.relationships.filter((relationship) => relationship.type === 'parent'); let familyIndex = 0; const consumedParent = new Set<string>()
  for (const relationship of spouse) { const familyId = `F${++familyIndex}`; rows.push(line(`@${familyId}@`, 0, 'FAM'), line('', 1, 'HUSB', `@${relationship.person1Id}@`), line('', 1, 'WIFE', `@${relationship.person2Id}@`)); const childIds = new Set<string>(); for (const edge of parent.filter((candidate) => candidate.person1Id === relationship.person1Id || candidate.person1Id === relationship.person2Id)) { childIds.add(edge.person2Id); consumedParent.add(edge.id) } for (const childId of childIds) rows.push(line('', 1, 'CHIL', `@${childId}@`)); if (relationship.status === 'divorced') rows.push(line('', 1, 'DIV')) }
  for (const edge of parent.filter((candidate) => !consumedParent.has(candidate.id))) rows.push(line(`@F${++familyIndex}@`, 0, 'FAM'), line('', 1, 'HUSB', `@${edge.person1Id}@`), line('', 1, 'CHIL', `@${edge.person2Id}@`))
  rows.push(line('', 0, 'TRLR')); return `${rows.join('\n')}\n`
}
