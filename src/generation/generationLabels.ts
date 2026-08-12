export function formatGenerationLabel(generation: number): string {
  if (generation === 0) return 'ĐỜI 0'
  return `ĐỜI ${generation > 0 ? '+' : ''}${generation}`
}

export function describeGeneration(generation: number): string {
  if (generation === 0) return 'Cùng đời với chủ thể'
  if (generation > 0) return generation === 1 ? 'Đời cha mẹ' : generation === 2 ? 'Đời ông bà' : `Tổ tiên cao hơn ${generation} đời`
  const depth = Math.abs(generation)
  return depth === 1 ? 'Đời con' : depth === 2 ? 'Đời cháu' : `Hậu duệ thấp hơn ${depth} đời`
}
