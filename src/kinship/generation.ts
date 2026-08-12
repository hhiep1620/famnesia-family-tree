import type { AncestralRole, Gender } from '../types/family'

export interface AncestorLabel {
  relationCode: string
  label: string
  shortLabel: string
}

function gendered(gender: Gender | undefined, male: string, female: string, generic: string) {
  return gender === 'male' ? male : gender === 'female' ? female : generic
}

export function getAncestorGenerationLabel(level: number, gender?: Gender, ancestralRole?: AncestralRole): AncestorLabel {
  if (ancestralRole === 'founding_ancestor') return { relationCode: 'founding_ancestor', label: 'Thủy tổ', shortLabel: 'Thủy tổ' }
  if (level === 1) return { relationCode: 'parent', label: gendered(gender, 'Bố', 'Mẹ', 'Cha/mẹ'), shortLabel: gendered(gender, 'Bố', 'Mẹ', 'Cha/mẹ') }
  if (level === 2) return { relationCode: 'grandparent', label: gendered(gender, 'Ông', 'Bà', 'Ông/bà'), shortLabel: gendered(gender, 'Ông', 'Bà', 'Ông/bà') }
  if (level === 3) return { relationCode: 'great_grandparent', label: gendered(gender, 'Cụ ông', 'Cụ bà', 'Cụ'), shortLabel: 'Cụ' }
  if (level === 4) return { relationCode: 'ancestor_generation_4', label: 'Kỵ', shortLabel: 'Kỵ' }
  if (level === 5) return { relationCode: 'ancestor_generation_5', label: 'Cụ tổ', shortLabel: 'Cụ tổ' }
  if (level >= 6) return { relationCode: `ancestor_generation_${level}`, label: 'Viễn tổ', shortLabel: 'Viễn tổ' }
  return { relationCode: 'ancestor', label: 'Tổ tiên', shortLabel: 'Tổ tiên' }
}

export function getDescendantGenerationLabel(level: number, gender?: Gender): AncestorLabel {
  if (level === 1) return { relationCode: 'child', label: gendered(gender, 'Con trai', 'Con gái', 'Con'), shortLabel: gendered(gender, 'Con trai', 'Con gái', 'Con') }
  if (level === 2) return { relationCode: 'grandchild', label: gendered(gender, 'Cháu trai', 'Cháu gái', 'Cháu'), shortLabel: 'Cháu' }
  if (level === 3) return { relationCode: 'great_grandchild', label: 'Chắt', shortLabel: 'Chắt' }
  if (level === 4) return { relationCode: 'descendant_generation_4', label: 'Chút', shortLabel: 'Chút' }
  return { relationCode: `descendant_generation_${level}`, label: `Hậu duệ đời ${level}`, shortLabel: `Đời ${level}` }
}
