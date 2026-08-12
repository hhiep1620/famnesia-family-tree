import type { FamilyGraph, Gender, Person, SpouseStatus } from '../types/family'
import type { KinshipStep } from './kinshipPath'
import { getAncestorGenerationLabel, getDescendantGenerationLabel } from './generation'

export interface ClassifiedKinship {
  relationCode: string
  label: string
  shortLabel: string
  confidence: 'exact' | 'generic'
  ancestorGeneration?: number
}

const gendered = (gender: Gender | undefined, male: string, female: string, generic: string) => gender === 'male' ? male : gender === 'female' ? female : generic

function compareBirthOrder(a?: Person, b?: Person): 'older' | 'younger' | 'unknown' {
  if (!a || !b) return 'unknown'
  if (a.birthDate && b.birthDate && a.birthDate !== b.birthDate) return a.birthDate < b.birthDate ? 'older' : 'younger'
  if (a.sortOrder !== undefined && b.sortOrder !== undefined && a.sortOrder !== b.sortOrder) return a.sortOrder < b.sortOrder ? 'older' : 'younger'
  return 'unknown'
}

function directSpouse(gender: Gender | undefined, status?: SpouseStatus): ClassifiedKinship {
  const former = status === 'divorced' || status === 'separated'
  if (former) {
    const label = gendered(gender, status === 'divorced' ? 'Chồng cũ' : 'Chồng đang ly thân', status === 'divorced' ? 'Vợ cũ' : 'Vợ đang ly thân', status === 'divorced' ? 'Bạn đời cũ' : 'Bạn đời đang ly thân')
    return { relationCode: status === 'divorced' ? 'former_spouse' : 'separated_spouse', label, shortLabel: label, confidence: 'exact' }
  }
  const label = gendered(gender, 'Chồng', 'Vợ', 'Bạn đời')
  return { relationCode: 'spouse', label, shortLabel: label, confidence: 'exact' }
}

function sibling(target: Person | undefined, subject: Person | undefined): ClassifiedKinship {
  const order = compareBirthOrder(target, subject)
  if (order === 'older') {
    const label = gendered(target?.gender, 'Anh', 'Chị', 'Anh/chị')
    return { relationCode: 'older_sibling', label, shortLabel: label, confidence: target?.gender && target.gender !== 'unknown' ? 'exact' : 'generic' }
  }
  if (order === 'younger') {
    const label = target?.gender === 'male' ? 'Em trai' : target?.gender === 'female' ? 'Em gái' : 'Em'
    return { relationCode: 'younger_sibling', label, shortLabel: label, confidence: target?.gender && target.gender !== 'unknown' ? 'exact' : 'generic' }
  }
  const label = gendered(target?.gender, 'Anh/em trai', 'Chị/em gái', 'Anh/chị/em')
  return { relationCode: 'sibling', label, shortLabel: 'Anh/chị/em', confidence: 'generic' }
}

function parentSibling(steps: KinshipStep[], graph: FamilyGraph): ClassifiedKinship {
  const parent = graph.personsById.get(steps[0].toId)
  const target = graph.personsById.get(steps.at(-1)!.toId)
  const order = compareBirthOrder(target, parent)
  if (parent?.gender === 'female') {
    const label = target?.gender === 'male' ? 'Cậu' : target?.gender === 'female' ? 'Dì' : 'Anh/chị/em của mẹ'
    return { relationCode: target?.gender === 'male' ? 'maternal_uncle' : target?.gender === 'female' ? 'maternal_aunt' : 'maternal_parent_sibling', label, shortLabel: label, confidence: target?.gender && target.gender !== 'unknown' ? 'exact' : 'generic' }
  }
  if (parent?.gender === 'male') {
    if (target?.gender === 'female') return { relationCode: 'paternal_aunt', label: 'Cô', shortLabel: 'Cô', confidence: 'exact' }
    if (target?.gender === 'male' && order === 'older') return { relationCode: 'paternal_older_uncle', label: 'Bác trai', shortLabel: 'Bác', confidence: 'exact' }
    if (target?.gender === 'male' && order === 'younger') return { relationCode: 'paternal_younger_uncle', label: 'Chú', shortLabel: 'Chú', confidence: 'exact' }
    return { relationCode: 'paternal_parent_sibling', label: target?.gender === 'male' ? 'Anh/em trai của bố' : 'Anh/chị/em của bố', shortLabel: 'Bên nội', confidence: 'generic' }
  }
  return { relationCode: 'parent_sibling', label: gendered(target?.gender, 'Anh/em trai của cha/mẹ', 'Chị/em gái của cha/mẹ', 'Anh/chị/em của cha/mẹ'), shortLabel: 'Cô/chú/bác', confidence: 'generic' }
}

function spouseOfExtended(base: ClassifiedKinship, targetGender?: Gender): ClassifiedKinship {
  const labels: Record<string, string> = {
    paternal_younger_uncle: 'Thím',
    paternal_older_uncle: targetGender === 'male' ? 'Bác trai' : 'Bác gái',
    paternal_aunt: 'Dượng',
    maternal_uncle: 'Mợ',
    maternal_aunt: 'Dượng',
  }
  const label = labels[base.relationCode]
  if (label) return { relationCode: `spouse_of_${base.relationCode}`, label, shortLabel: label, confidence: 'exact' }
  return { relationCode: `spouse_of_${base.relationCode}`, label: `Bạn đời của ${base.label.toLowerCase()}`, shortLabel: 'Thông gia', confidence: 'generic' }
}

export function classifyVietnameseKinship(subjectId: string, steps: KinshipStep[], graph: FamilyGraph): ClassifiedKinship {
  const target = steps.length ? graph.personsById.get(steps.at(-1)!.toId) : graph.personsById.get(subjectId)
  const types = steps.map((step) => step.type)
  if (!steps.length) return { relationCode: 'self', label: 'Tôi', shortLabel: 'Tôi', confidence: 'exact' }
  if (types.length === 1 && types[0] === 'spouse') return directSpouse(target?.gender, steps[0].relationship.status)
  if (types.every((type) => type === 'parent')) {
    const result = getAncestorGenerationLabel(types.length, target?.gender, target?.ancestralRole)
    if (target?.ancestralRole === 'founding_ancestor') return { ...result, confidence: 'exact', ancestorGeneration: types.length }
    if (types.length === 2) {
      const branch = graph.personsById.get(steps[0].toId)?.gender
      const label = branch === 'male'
        ? gendered(target?.gender, 'Ông nội', 'Bà nội', 'Ông/bà nội')
        : branch === 'female'
          ? gendered(target?.gender, 'Ông ngoại', 'Bà ngoại', 'Ông/bà ngoại')
          : result.label
      return { ...result, label, shortLabel: label, confidence: branch && branch !== 'unknown' ? 'exact' : 'generic', ancestorGeneration: types.length }
    }
    return { ...result, confidence: 'exact', ancestorGeneration: types.length }
  }
  if (types.every((type) => type === 'child')) return { ...getDescendantGenerationLabel(types.length, target?.gender), confidence: 'exact' }
  if (types.length === 2 && types[0] === 'parent' && types[1] === 'child') return sibling(target, graph.personsById.get(subjectId))
  if (types.length === 3 && types.join(',') === 'parent,parent,child') return parentSibling(steps, graph)
  if (types.length === 4 && types.slice(0, 3).join(',') === 'parent,parent,child' && types[3] === 'spouse') {
    return spouseOfExtended(parentSibling(steps.slice(0, 3), graph), target?.gender)
  }
  const parentCount = types.filter((type) => type === 'parent').length
  const childCount = types.filter((type) => type === 'child').length
  if (!types.includes('spouse') && parentCount === childCount && parentCount >= 2) {
    const base = sibling(target, graph.personsById.get(subjectId))
    return { relationCode: 'cousin', label: `${base.label} họ`, shortLabel: 'Anh/chị/em họ', confidence: base.confidence }
  }
  return { relationCode: 'relative', label: 'Họ hàng', shortLabel: 'Họ hàng', confidence: 'generic' }
}
