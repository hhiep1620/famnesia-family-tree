import { BaseEdge, type Edge, type EdgeProps } from '@xyflow/react'

type FamilyBranch = Edge<{ lane?: number }, 'familyBranch'>

export function FamilyBranchEdge({ id, sourceX, sourceY, targetX, targetY, data, markerEnd, style }: EdgeProps<FamilyBranch>) {
  const lane = data?.lane ?? 0
  const busY = Math.min(targetY - 18, sourceY + 18 + lane * 18)
  const path = Math.abs(sourceX - targetX) < 1
    ? `M ${sourceX} ${sourceY} V ${targetY}`
    : `M ${sourceX} ${sourceY} V ${busY} H ${targetX} V ${targetY}`
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
}
