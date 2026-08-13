import { z } from 'zod'
import type { FamilyData, Person, Relationship } from '../types/family.js'

export const CURRENT_SCHEMA_VERSION = 3

const GENDERS = ['male', 'female', 'other', 'unknown'] as const
const ANCESTRAL_ROLES = ['none', 'founding_ancestor'] as const
const SPOUSE_STATUSES = ['married', 'partner', 'separated', 'divorced', 'widowed', 'unknown'] as const
const FACT_CONFIDENCE = ['confirmed', 'likely', 'estimated', 'unknown'] as const

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

const CalendarDateSchema = z.string().refine(isCalendarDate, 'Ngày phải đúng định dạng YYYY-MM-DD và tồn tại.')
const IsoDateTimeSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Thời gian ISO không hợp lệ.')
const OptionalDateSchema = z.union([CalendarDateSchema, z.null()]).optional()
const OptionalTextSchema = z.union([z.string(), z.null()]).optional()

export const ProfileSchema = z.object({
  id: z.string().trim().min(1, 'Profile ID không được để trống.'),
  name: z.string().trim().min(1, 'Tên gia đình không được để trống.'),
  description: z.string().default(''),
  photoFileId: OptionalTextSchema,
  subjectPersonId: OptionalTextSchema,
  requiresSecret: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

export const DeathLunarSchema = z.object({
  day: z.number().int().min(1).max(30),
  month: z.number().int().min(1).max(12),
  leapMonth: z.boolean().default(false),
})

export const PersonSchema = z.object({
  id: z.string().trim().min(1, 'Person ID không được để trống.'),
  profileId: z.string().trim().min(1, 'profileId không được để trống.'),
  name: z.string().trim().min(1, 'Tên thành viên không được để trống.'),
  nickname: OptionalTextSchema,
  gender: z.enum(GENDERS).default('unknown'),
  birthDate: OptionalDateSchema,
  isDeceased: z.boolean().default(false),
  deathDate: OptionalDateSchema,
  deathLunar: z.union([DeathLunarSchema, z.null()]).optional(),
  phone1: z.string().default(''),
  phone2: z.string().default(''),
  address: z.string().default(''),
  note: z.string().default(''),
  ancestralRole: z.enum(ANCESTRAL_ROLES).default('none'),
  sortOrder: z.number().finite().optional(),
  createdAt: IsoDateTimeSchema.optional(),
  updatedAt: IsoDateTimeSchema.optional(),
  confidence: z.object({ birthDate: z.enum(FACT_CONFIDENCE).optional(), deathDate: z.enum(FACT_CONFIDENCE).optional() }).optional(),
})

export const PersonMediaSchema = z.object({
  id: z.string().trim().min(1, 'Media ID không được để trống.'),
  profileId: z.string().trim().min(1, 'profileId không được để trống.'),
  personId: z.string().trim().min(1, 'personId không được để trống.'),
  driveFileId: z.string().trim().regex(/^[A-Za-z0-9_-]+$/, 'Drive file ID không hợp lệ.'),
  type: z.literal('photo'),
  isPrimary: z.boolean().default(false),
  caption: z.string().default(''),
  takenDate: OptionalDateSchema,
  sortOrder: z.number().finite().optional(),
  createdAt: IsoDateTimeSchema.optional(),
})

export const RelationshipSchema = z.object({
  id: z.string().trim().min(1, 'Relationship ID không được để trống.'),
  profileId: z.string().trim().min(1, 'profileId không được để trống.'),
  person1Id: z.string().trim().min(1),
  person2Id: z.string().trim().min(1),
  type: z.enum(['parent', 'spouse']),
  status: z.enum(SPOUSE_STATUSES).optional(),
  startDate: OptionalDateSchema,
  endDate: OptionalDateSchema,
  sortOrder: z.number().finite().optional(),
  createdAt: IsoDateTimeSchema.optional(),
  updatedAt: IsoDateTimeSchema.optional(),
  confidence: z.enum(FACT_CONFIDENCE).optional(),
}).superRefine((relationship, context) => {
  if (relationship.type === 'parent' && relationship.status !== undefined) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'Quan hệ cha/mẹ không được có trạng thái hôn phối.' })
  }
})

function relationshipKey(relationship: Relationship): string {
  if (relationship.type === 'parent') return `parent:${relationship.person1Id}:${relationship.person2Id}`
  return `spouse:${[relationship.person1Id, relationship.person2Id].sort().join(':')}`
}

function hasAncestryCycle(relationships: Relationship[]): boolean {
  const children = new Map<string, string[]>()
  for (const relationship of relationships) {
    if (relationship.type !== 'parent') continue
    children.set(relationship.person1Id, [...(children.get(relationship.person1Id) ?? []), relationship.person2Id])
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    if ((children.get(id) ?? []).some(visit)) return true
    visiting.delete(id)
    visited.add(id)
    return false
  }
  return [...new Set(relationships.flatMap((item) => [item.person1Id, item.person2Id]))].some(visit)
}

export const FamilyDataSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  updatedAt: IsoDateTimeSchema.optional(),
  profiles: z.array(ProfileSchema).default([]),
  persons: z.array(PersonSchema).default([]),
  relationships: z.array(RelationshipSchema).default([]),
  media: z.array(PersonMediaSchema).default([]),
  settings: z.object({
    timezone: z.string().trim().min(1).default('Asia/Ho_Chi_Minh'),
    locale: z.string().trim().min(1).default('vi-VN'),
    duplicateSuppressions: z.array(z.string().trim().min(1)).default([]),
  }).default({ timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', duplicateSuppressions: [] }),
}).superRefine((data, context) => {
  const duplicateCheck = (values: string[], path: 'profiles' | 'persons' | 'relationships' | 'media', label: string) => {
    const seen = new Set<string>()
    values.forEach((id, index) => {
      if (seen.has(id)) context.addIssue({ code: 'custom', path: [path, index, 'id'], message: `${label} '${id}' bị trùng.` })
      seen.add(id)
    })
  }
  duplicateCheck(data.profiles.map((item) => item.id), 'profiles', 'Profile ID')
  duplicateCheck(data.persons.map((item) => item.id), 'persons', 'Person ID')
  duplicateCheck(data.relationships.map((item) => item.id), 'relationships', 'Relationship ID')
  duplicateCheck(data.media.map((item) => item.id), 'media', 'Media ID')

  const profiles = new Map(data.profiles.map((profile) => [profile.id, profile]))
  const persons = new Map(data.persons.map((person) => [person.id, person]))
  data.persons.forEach((person, index) => {
    if (!profiles.has(person.profileId ?? '')) {
      context.addIssue({ code: 'custom', path: ['persons', index, 'profileId'], message: `Không tìm thấy profile '${person.profileId}'.` })
    }
  })
  data.profiles.forEach((profile, index) => {
    if (!profile.subjectPersonId) return
    const subject = persons.get(profile.subjectPersonId)
    if (!subject || subject.profileId !== profile.id) {
      context.addIssue({ code: 'custom', path: ['profiles', index, 'subjectPersonId'], message: `Chủ thể '${profile.subjectPersonId}' không thuộc profile này.` })
    }
  })

  const primaryByPerson = new Map<string, number>()
  data.media.forEach((media, index) => {
    const person = persons.get(media.personId)
    if (!profiles.has(media.profileId)) context.addIssue({ code: 'custom', path: ['media', index, 'profileId'], message: `Không tìm thấy profile '${media.profileId}'.` })
    if (!person) context.addIssue({ code: 'custom', path: ['media', index, 'personId'], message: `Không tìm thấy người '${media.personId}'.` })
    if (person && person.profileId !== media.profileId) context.addIssue({ code: 'custom', path: ['media', index, 'personId'], message: 'Ảnh và thành viên không thuộc cùng profile.' })
    if (media.isPrimary) primaryByPerson.set(media.personId, (primaryByPerson.get(media.personId) ?? 0) + 1)
  })
  for (const [personId, count] of primaryByPerson) {
    if (count > 1) context.addIssue({ code: 'custom', path: ['media'], message: `Thành viên '${personId}' có nhiều hơn một ảnh đại diện.` })
  }

  const relationshipKeys = new Set<string>()
  data.relationships.forEach((relationship, index) => {
    const person1 = persons.get(relationship.person1Id)
    const person2 = persons.get(relationship.person2Id)
    if (!profiles.has(relationship.profileId ?? '')) {
      context.addIssue({ code: 'custom', path: ['relationships', index, 'profileId'], message: `Không tìm thấy profile '${relationship.profileId}'.` })
    }
    if (!person1) context.addIssue({ code: 'custom', path: ['relationships', index, 'person1Id'], message: `Không tìm thấy người '${relationship.person1Id}'.` })
    if (!person2) context.addIssue({ code: 'custom', path: ['relationships', index, 'person2Id'], message: `Không tìm thấy người '${relationship.person2Id}'.` })
    if (person1 && person1.profileId !== relationship.profileId) context.addIssue({ code: 'custom', path: ['relationships', index, 'person1Id'], message: 'Người thứ nhất không thuộc cùng profile với quan hệ.' })
    if (person2 && person2.profileId !== relationship.profileId) context.addIssue({ code: 'custom', path: ['relationships', index, 'person2Id'], message: 'Người thứ hai không thuộc cùng profile với quan hệ.' })
    if (relationship.person1Id === relationship.person2Id) {
      context.addIssue({ code: 'custom', path: ['relationships', index], message: relationship.type === 'parent' ? 'Một người không thể là cha/mẹ của chính mình.' : 'Một người không thể là bạn đời của chính mình.' })
    }
    const key = relationshipKey(relationship as Relationship)
    if (relationshipKeys.has(key)) context.addIssue({ code: 'custom', path: ['relationships', index], message: 'Quan hệ này bị trùng.' })
    relationshipKeys.add(key)
  })

  if (hasAncestryCycle(data.relationships as Relationship[])) {
    context.addIssue({ code: 'custom', path: ['relationships'], message: 'Phát hiện vòng lặp tổ tiên trong quan hệ cha/mẹ.' })
  }
})

export interface FamilyDataValidation {
  data?: FamilyData
  errors: string[]
  warnings: string[]
}

function issueText(issue: z.core.$ZodIssue): string {
  const location = issue.path.length ? issue.path.join('.') : 'family.json'
  return `${location}: ${issue.message}`
}

function collectWarnings(data: FamilyData): string[] {
  const warnings: string[] = []
  if (data.profiles.length === 0) warnings.push('Tệp chưa có gia đình nào. Bạn có thể tạo gia đình sau khi import.')
  for (const person of data.persons) {
    if (person.isDeceased && !person.deathDate && !person.deathLunar) warnings.push(`${person.name} được đánh dấu đã mất nhưng chưa có ngày mất hoặc ngày giỗ.`)
    if (!person.isDeceased && (person.deathDate || person.deathLunar)) warnings.push(`${person.name} có thông tin ngày mất nhưng chưa được đánh dấu đã mất.`)
  }
  return warnings
}

export function validateFamilyData(input: unknown): FamilyDataValidation {
  const result = FamilyDataSchema.safeParse(input)
  if (!result.success) return { errors: result.error.issues.map(issueText), warnings: [] }
  const data = result.data as FamilyData
  return { data, errors: [], warnings: collectWarnings(data) }
}

export function createEmptyFamilyData(now = new Date().toISOString()): FamilyData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: now,
    profiles: [],
    persons: [],
    relationships: [],
    media: [],
    settings: { timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', duplicateSuppressions: [] },
  }
}

export function migrateFamilyData(input: unknown): unknown {
  if (!input || typeof input !== 'object') throw new Error('family.json phải chứa một JSON object.')
  const version = (input as { schemaVersion?: unknown }).schemaVersion
  if (version === CURRENT_SCHEMA_VERSION) return input
  if (typeof version !== 'number') throw new Error('family.json thiếu schemaVersion.')
  if (version === 1) {
    const legacy = input as Record<string, unknown> & { persons?: Array<Record<string, unknown>>; media?: unknown[] }
    const media = Array.isArray(legacy.media) ? [...legacy.media] : []
    let mediaSequence = media.reduce<number>((current, item) => {
      if (!item || typeof item !== 'object') return current
      const match = /^M(\d+)$/i.exec(String((item as { id?: unknown }).id ?? ''))
      return match ? Math.max(current, Number(match[1])) : current
    }, 0)
    const persons = (Array.isArray(legacy.persons) ? legacy.persons : []).map((person) => {
      const { photoFileId, ...rest } = person
      if (typeof photoFileId === 'string' && photoFileId.trim()) {
        mediaSequence += 1
        media.push({
          id: `M${String(mediaSequence).padStart(4, '0')}`,
          profileId: person.profileId,
          personId: person.id,
          driveFileId: photoFileId.trim(),
          type: 'photo',
          isPrimary: true,
          caption: '',
          takenDate: null,
          sortOrder: 1,
          createdAt: person.updatedAt ?? person.createdAt,
        })
      }
      return { ...rest, phone1: '', phone2: '', address: '', note: '' }
    })
    return migrateFamilyData({ ...legacy, schemaVersion: 2, persons, media })
  }
  if (version === 2) {
    const legacy = input as Record<string, unknown> & { settings?: Record<string, unknown> }
    return { ...legacy, schemaVersion: CURRENT_SCHEMA_VERSION, settings: { ...(legacy.settings ?? {}), duplicateSuppressions: [] } }
  }
  throw new Error(`schemaVersion ${version} chưa được hỗ trợ. Phiên bản hiện tại là ${CURRENT_SCHEMA_VERSION}.`)
}

export function requireValidFamilyData(input: unknown): FamilyData {
  const validation = validateFamilyData(migrateFamilyData(input))
  if (!validation.data) throw new Error(validation.errors.join('\n'))
  return validation.data
}

export function normalizePersonForStorage(person: Person): Person {
  return {
    ...person,
    nickname: person.nickname || null,
    birthDate: person.birthDate || null,
    deathDate: person.deathDate || null,
    deathLunar: person.deathLunar ?? null,
    phone1: person.phone1?.trim() ?? '',
    phone2: person.phone2?.trim() ?? '',
    address: person.address?.trim() ?? '',
    note: person.note?.trim() ?? '',
  }
}
