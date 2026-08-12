import type { FamilyGraph, Gender, KinshipBranch, Person, SpouseStatus } from '../types/family'
import type { KinshipStep } from './kinshipPath'
import { getDescendantGenerationLabel } from './generation'

export interface ClassifiedKinship {
  relationCode: string
  label: string
  shortLabel: string
  branch: KinshipBranch
  confidence: 'exact' | 'generic'
  ancestorGeneration?: number
}

type BirthOrder = 'older' | 'younger' | 'unknown'

const gendered = (gender: Gender | undefined, male: string, female: string, generic: string) => gender === 'male' ? male : gender === 'female' ? female : generic
const exactGender = (gender?: Gender) => gender === 'male' || gender === 'female'

function compareBirthOrder(a?: Person, b?: Person): BirthOrder {
  if (!a || !b) return 'unknown'
  if (a.birthDate && b.birthDate && a.birthDate !== b.birthDate) return a.birthDate < b.birthDate ? 'older' : 'younger'
  if (a.sortOrder !== undefined && b.sortOrder !== undefined && a.sortOrder !== b.sortOrder) return a.sortOrder < b.sortOrder ? 'older' : 'younger'
  return 'unknown'
}

function branchFromParent(person?: Person): KinshipBranch {
  if (person?.gender === 'male') return 'paternal'
  if (person?.gender === 'female') return 'maternal'
  return 'direct'
}

function branchFromSteps(steps: KinshipStep[], graph: FamilyGraph): KinshipBranch {
  if (steps[0]?.type === 'spouse') return 'spouse'
  if (steps[0]?.type !== 'parent') return 'direct'
  return branchFromParent(graph.personsById.get(steps[0].toId))
}

function branchSuffix(branch: KinshipBranch): string {
  if (branch === 'paternal') return 'bên nội'
  if (branch === 'maternal') return 'bên ngoại'
  if (branch === 'spouse') return 'bên vợ/chồng'
  return ''
}

function classified(relationCode: string, label: string, shortLabel = label, branch: KinshipBranch = 'direct', confidence: 'exact' | 'generic' = 'exact', ancestorGeneration?: number): ClassifiedKinship {
  return { relationCode, label, shortLabel, branch, confidence, ancestorGeneration }
}

function directSpouse(gender: Gender | undefined, status?: SpouseStatus): ClassifiedKinship {
  const former = status === 'divorced' || status === 'separated'
  if (former) {
    const label = gendered(gender, status === 'divorced' ? 'Chồng cũ' : 'Chồng đang ly thân', status === 'divorced' ? 'Vợ cũ' : 'Vợ đang ly thân', status === 'divorced' ? 'Bạn đời cũ' : 'Bạn đời đang ly thân')
    return classified(status === 'divorced' ? 'former_spouse' : 'separated_spouse', label, label, 'spouse')
  }
  const label = gendered(gender, 'Chồng', 'Vợ', 'Bạn đời')
  return classified('spouse', label, label, 'spouse', exactGender(gender) ? 'exact' : 'generic')
}

function siblingLabel(target: Person | undefined, subject: Person | undefined, suffix = 'ruột', branch: KinshipBranch = 'direct'): ClassifiedKinship {
  const order = compareBirthOrder(target, subject)
  if (order === 'older') {
    const label = gendered(target?.gender, `Anh ${suffix}`, `Chị ${suffix}`, `Anh/chị ${suffix}`)
    return classified('older_sibling', label, label, branch, exactGender(target?.gender) ? 'exact' : 'generic')
  }
  if (order === 'younger') {
    const label = gendered(target?.gender, `Em trai ${suffix}`, `Em gái ${suffix}`, `Em ${suffix}`)
    return classified('younger_sibling', label, label, branch, exactGender(target?.gender) ? 'exact' : 'generic')
  }
  const label = gendered(target?.gender, `Anh/em trai ${suffix}`, `Chị/em gái ${suffix}`, `Anh/chị/em ${suffix}`)
  return classified('sibling', label, `Anh/chị/em ${suffix}`, branch, 'generic')
}

function cousinLabel(target: Person | undefined, subject: Person | undefined, branch: KinshipBranch): ClassifiedKinship {
  const order = compareBirthOrder(target, subject)
  const side = branchSuffix(branch)
  if (order === 'older') {
    const base = gendered(target?.gender, 'Anh họ', 'Chị họ', 'Anh/chị họ')
    return classified('older_cousin', `${base} ${side}`.trim(), `${base} ${branch === 'paternal' ? 'nội' : branch === 'maternal' ? 'ngoại' : ''}`.trim(), branch, exactGender(target?.gender) ? 'exact' : 'generic')
  }
  if (order === 'younger') return classified('younger_cousin', `Em họ ${side}`.trim(), `Em họ ${branch === 'paternal' ? 'nội' : branch === 'maternal' ? 'ngoại' : ''}`.trim(), branch)
  const base = gendered(target?.gender, 'Anh/em họ', 'Chị/em họ', 'Anh/chị/em họ')
  return classified('cousin', `${base} ${side}`.trim(), base, branch, 'generic')
}

function ancestorLabel(level: number, target: Person | undefined, branch: KinshipBranch): ClassifiedKinship {
  if (target?.ancestralRole === 'founding_ancestor') return classified('founding_ancestor', 'Thủy tổ', 'Thủy tổ', branch, 'exact', level)
  if (level === 1) {
    const label = gendered(target?.gender, 'Bố', 'Mẹ', 'Cha/mẹ')
    return classified('parent', label, label, branch, exactGender(target?.gender) ? 'exact' : 'generic', level)
  }
  const side = branch === 'paternal' ? 'nội' : branch === 'maternal' ? 'ngoại' : ''
  const generation = level === 2 ? 'Ông/bà' : level === 3 ? 'Cụ' : level === 4 ? 'Kỵ' : level === 5 ? 'Cụ tổ' : level >= 6 ? 'Viễn tổ' : 'Tổ tiên'
  const genderPrefix = level === 2
    ? gendered(target?.gender, 'Ông', 'Bà', 'Ông/bà')
    : gendered(target?.gender, `${generation} ông`, `${generation} bà`, generation)
  const label = `${genderPrefix}${side ? ` ${side}` : ''}`
  return classified(level === 2 ? 'grandparent' : `ancestor_generation_${level}`, label, label, branch, branch === 'direct' || !exactGender(target?.gender) ? 'generic' : 'exact', level)
}

function descendantLabel(steps: KinshipStep[], target: Person | undefined, graph: FamilyGraph): ClassifiedKinship {
  if (steps.length === 1) {
    const result = getDescendantGenerationLabel(1, target?.gender)
    return classified(result.relationCode, result.label, result.shortLabel)
  }
  if (steps.length === 2) {
    const child = graph.personsById.get(steps[0].toId)
    const side = child?.gender === 'male' ? 'nội' : child?.gender === 'female' ? 'ngoại' : ''
    const label = `${gendered(target?.gender, 'Cháu trai', 'Cháu gái', 'Cháu')}${side ? ` ${side}` : ''}`
    return classified('grandchild', label, label, 'direct', side && exactGender(target?.gender) ? 'exact' : 'generic')
  }
  const result = getDescendantGenerationLabel(steps.length, target?.gender)
  return classified(result.relationCode, result.label, result.shortLabel)
}

function parentSibling(steps: KinshipStep[], graph: FamilyGraph, outerBranch?: KinshipBranch): ClassifiedKinship {
  const parent = graph.personsById.get(steps[0].toId)
  const target = graph.personsById.get(steps.at(-1)!.toId)
  const branch = outerBranch ?? branchFromParent(parent)
  const order = compareBirthOrder(target, parent)
  if (parent?.gender === 'female') {
    if (order === 'older') {
      const label = gendered(target?.gender, 'Bác trai', 'Bác gái', 'Bác')
      return classified(target?.gender === 'male' ? 'maternal_older_uncle' : target?.gender === 'female' ? 'maternal_older_aunt' : 'maternal_older_sibling', label, 'Bác', branch, exactGender(target?.gender) ? 'exact' : 'generic')
    }
    if (order === 'younger') {
      const label = gendered(target?.gender, 'Cậu', 'Dì', 'Cậu/dì')
      return classified(target?.gender === 'male' ? 'maternal_younger_uncle' : target?.gender === 'female' ? 'maternal_younger_aunt' : 'maternal_younger_sibling', label, label, branch, exactGender(target?.gender) ? 'exact' : 'generic')
    }
    const label = gendered(target?.gender, 'Anh/em trai của mẹ', 'Chị/em gái của mẹ', 'Anh/chị/em của mẹ')
    return classified('maternal_parent_sibling', label, 'Bác/cậu/dì', branch, 'generic')
  }
  if (parent?.gender === 'male') {
    if (order === 'older') {
      const label = gendered(target?.gender, 'Bác trai', 'Bác gái', 'Bác')
      return classified(target?.gender === 'male' ? 'paternal_older_uncle' : target?.gender === 'female' ? 'paternal_older_aunt' : 'paternal_older_sibling', label, 'Bác', branch, exactGender(target?.gender) ? 'exact' : 'generic')
    }
    if (order === 'younger') {
      const label = gendered(target?.gender, 'Chú', 'Cô', 'Chú/cô')
      return classified(target?.gender === 'male' ? 'paternal_younger_uncle' : target?.gender === 'female' ? 'paternal_younger_aunt' : 'paternal_younger_sibling', label, label, branch, exactGender(target?.gender) ? 'exact' : 'generic')
    }
    const label = gendered(target?.gender, 'Anh/em trai của bố', 'Chị/em gái của bố', 'Anh/chị/em của bố')
    return classified('paternal_parent_sibling', label, 'Bác/chú/cô', branch, 'generic')
  }
  const label = gendered(target?.gender, 'Anh/em trai của cha/mẹ', 'Chị/em gái của cha/mẹ', 'Anh/chị/em của cha/mẹ')
  return classified('parent_sibling', label, 'Cô/chú/bác', branch, 'generic')
}

function spouseOfExtended(base: ClassifiedKinship, status?: SpouseStatus, side?: string): ClassifiedKinship {
  const labels: Record<string, string> = {
    paternal_younger_uncle: 'Thím',
    paternal_younger_aunt: 'Dượng',
    paternal_older_uncle: 'Bác gái',
    paternal_older_aunt: 'Bác trai',
    maternal_younger_uncle: 'Mợ',
    maternal_younger_aunt: 'Dượng',
    maternal_older_uncle: 'Bác gái',
    maternal_older_aunt: 'Bác trai',
  }
  let label = labels[base.relationCode] ?? `Bạn đời của ${base.label.toLowerCase()}`
  if (status === 'divorced') label += ' cũ'
  else if (status === 'separated') label += ' đang ly thân'
  if (side) label += ` ${side}`
  return classified(`spouse_of_${base.relationCode}`, label, label, base.branch, labels[base.relationCode] ? 'exact' : 'generic')
}

function siblingSpouse(steps: KinshipStep[], graph: FamilyGraph): ClassifiedKinship {
  const sibling = graph.personsById.get(steps[1].toId)
  const subject = graph.personsById.get(steps[0].fromId)
  const order = compareBirthOrder(sibling, subject)
  const target = graph.personsById.get(steps[2].toId)
  let label: string
  if (sibling?.gender === 'female' && target?.gender === 'male') label = order === 'older' ? 'Anh rể' : order === 'younger' ? 'Em rể' : 'Anh/em rể'
  else if (sibling?.gender === 'male' && target?.gender === 'female') label = order === 'older' ? 'Chị dâu' : order === 'younger' ? 'Em dâu' : 'Chị/em dâu'
  else label = 'Bạn đời của anh/chị/em ruột'
  return classified('sibling_spouse', label, label, 'direct', label.startsWith('Bạn') ? 'generic' : 'exact')
}

function spouseFamilySide(subject: Person | undefined, spouse: Person | undefined): 'vợ' | 'chồng' | 'vợ/chồng' {
  if (spouse?.gender === 'female' || subject?.gender === 'male') return 'vợ'
  if (spouse?.gender === 'male' || subject?.gender === 'female') return 'chồng'
  return 'vợ/chồng'
}

function spouseFamily(subjectId: string, steps: KinshipStep[], graph: FamilyGraph): ClassifiedKinship | undefined {
  if (steps[0]?.type !== 'spouse') return undefined
  const subject = graph.personsById.get(subjectId)
  const spouse = graph.personsById.get(steps[0].toId)
  const target = graph.personsById.get(steps.at(-1)!.toId)
  const side = spouseFamilySide(subject, spouse)
  const rest = steps.slice(1)
  const types = rest.map((step) => step.type).join(',')
  if (types === 'parent') {
    const label = gendered(target?.gender, `Bố ${side}`, `Mẹ ${side}`, `Bố/mẹ ${side}`)
    return classified('parent_in_law', label, label, 'spouse', exactGender(target?.gender) ? 'exact' : 'generic')
  }
  if (rest.length >= 2 && rest.every((step) => step.type === 'parent')) {
    const generation = rest.length === 2 ? gendered(target?.gender, 'Ông', 'Bà', 'Ông/bà') : gendered(target?.gender, 'Cụ ông', 'Cụ bà', 'Cụ')
    const label = `${generation} bên ${side}`
    return classified(`ancestor_in_law_${rest.length}`, label, label, 'spouse', exactGender(target?.gender) ? 'exact' : 'generic', rest.length)
  }
  if (types === 'parent,child') {
    const order = compareBirthOrder(target, spouse)
    const base = order === 'older'
      ? gendered(target?.gender, 'Anh', 'Chị', 'Anh/chị')
      : order === 'younger'
        ? gendered(target?.gender, 'Em trai', 'Em gái', 'Em')
        : gendered(target?.gender, 'Anh/em trai', 'Chị/em gái', 'Anh/chị/em')
    return classified('spouse_sibling', `${base} ${side}`, `${base} ${side}`, 'spouse', order !== 'unknown' && exactGender(target?.gender) ? 'exact' : 'generic')
  }
  if (types === 'parent,parent,child') {
    const base = parentSibling(rest, graph, 'spouse')
    return classified(`spouse_${base.relationCode}`, `${base.label} bên ${side}`, `${base.shortLabel} bên ${side}`, 'spouse', base.confidence)
  }
  if (types === 'parent,parent,child,spouse') {
    const base = parentSibling(rest.slice(0, 3), graph, 'spouse')
    return spouseOfExtended(base, rest.at(-1)?.relationship.status, `bên ${side}`)
  }
  if (types === 'parent,parent,child,child') {
    const result = cousinLabel(target, spouse, 'spouse')
    const base = result.label.replace(' bên vợ/chồng', '')
    return classified(`spouse_${result.relationCode}`, `${base} bên ${side}`, `${base} bên ${side}`, 'spouse', result.confidence)
  }
  return undefined
}

export function classifyVietnameseKinship(subjectId: string, steps: KinshipStep[], graph: FamilyGraph): ClassifiedKinship {
  const subject = graph.personsById.get(subjectId)
  const target = steps.length ? graph.personsById.get(steps.at(-1)!.toId) : subject
  const types = steps.map((step) => step.type)
  const pattern = types.join(',')
  if (!steps.length) return classified('self', 'Tôi', 'Tôi')
  if (types.length === 1 && types[0] === 'spouse') return directSpouse(target?.gender, steps[0].relationship.status)

  const inLaw = spouseFamily(subjectId, steps, graph)
  if (inLaw) return inLaw

  if (types.every((type) => type === 'parent')) return ancestorLabel(types.length, target, branchFromSteps(steps, graph))
  if (types.every((type) => type === 'child')) return descendantLabel(steps, target, graph)
  if (pattern === 'child,spouse') {
    const label = gendered(target?.gender, 'Con rể', 'Con dâu', 'Bạn đời của con')
    return classified('child_spouse', label, label, 'direct', exactGender(target?.gender) ? 'exact' : 'generic')
  }
  if (pattern === 'parent,child') return siblingLabel(target, subject)
  if (pattern === 'parent,child,spouse') return siblingSpouse(steps, graph)
  if (pattern === 'parent,child,child') {
    const label = gendered(target?.gender, 'Cháu trai ruột', 'Cháu gái ruột', 'Cháu ruột')
    return classified('sibling_child', label, 'Cháu ruột', 'direct', exactGender(target?.gender) ? 'exact' : 'generic')
  }
  if (pattern === 'parent,parent,child') return parentSibling(steps, graph)
  if (pattern === 'parent,parent,child,spouse') return spouseOfExtended(parentSibling(steps.slice(0, 3), graph), steps.at(-1)?.relationship.status)
  if (!types.includes('spouse') && pattern === 'parent,parent,child,child') return cousinLabel(target, subject, branchFromSteps(steps, graph))
  if (!types.includes('spouse') && pattern === 'parent,parent,child,child,child') {
    const branch = branchFromSteps(steps, graph)
    const label = `${gendered(target?.gender, 'Cháu trai họ', 'Cháu gái họ', 'Cháu họ')} ${branchSuffix(branch)}`.trim()
    return classified('cousin_child', label, 'Cháu họ', branch, exactGender(target?.gender) ? 'exact' : 'generic')
  }

  return classified('relative', 'Họ hàng', 'Họ hàng', branchFromSteps(steps, graph), 'generic')
}
