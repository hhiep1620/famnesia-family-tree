import dagre from '@dagrejs/dagre'
import type { Edge, Node } from '@xyflow/react'
import type { FamilyGraph, FamilyUnit, Person } from '../types/family'
import type { FamilyEventType, KinshipResult } from '../types/family'
import { calculateAge } from '../calendar/dateUtils'
import { SPOUSE_STATUS_LABELS } from '../kinship/kinshipRules'

export interface PersonNodeData extends Record<string, unknown> {
  personId: string
  name: string
  nickname?: string
  lifeLabel?: string
  kinshipLabel?: string
  isSubject?: boolean
  isDeceased?: boolean
  isDimmed?: boolean
  eventType?: FamilyEventType
  photoFileId?: string
  workspaceId?: string
}

export type PersonFlowNode = Node<PersonNodeData, 'person'>
export type ConnectorFlowNode = Node<Record<string, never>, 'connector'>

export const PERSON_WIDTH = 160
export const PERSON_HEIGHT = 178
const UNIT_SIZE = 14
const COUPLE_GAP = 24
const FAMILY_GROUP_GAP = 64

function getLifeLabel(person: Person): string | undefined {
  if (person.isDeceased) return `${person.birthDate?.slice(0, 4) ?? '?'} – ${person.deathDate?.slice(0, 4) ?? '?'}`
  const age = calculateAge(person.birthDate ?? undefined)
  return age === undefined ? undefined : `${age} tuổi`
}

export function createFlowNodes(
  graph: FamilyGraph,
  units: FamilyUnit[],
  workspaceId?: string,
  options?: {
    subjectId?: string
    kinships?: Map<string, KinshipResult>
    highlightedIds?: Set<string>
    eventTypes?: Map<string, FamilyEventType>
    filterActive?: boolean
  },
): Array<PersonFlowNode | ConnectorFlowNode> {
  const nodes: Array<PersonFlowNode | ConnectorFlowNode> = [...graph.personsById.values()].map((person) => ({
    id: person.id,
    type: 'person',
    position: { x: 0, y: 0 },
    data: {
      personId: person.id,
      name: person.name,
      nickname: person.nickname ?? undefined,
      lifeLabel: getLifeLabel(person),
      kinshipLabel: options?.kinships?.get(person.id)?.shortLabel,
      isSubject: options?.subjectId === person.id,
      isDeceased: person.isDeceased,
      isDimmed: options?.filterActive && !options.highlightedIds?.has(person.id),
      eventType: options?.eventTypes?.get(person.id),
      photoFileId: person.photoFileId ?? undefined,
      workspaceId,
    },
  }))
  nodes.push(...units.map((unit) => ({
    id: unit.id,
    type: 'connector' as const,
    position: { x: 0, y: 0 },
    data: {},
    selectable: false,
    focusable: false,
  })))
  return nodes
}

export function createFlowEdges(graph: FamilyGraph, units: FamilyUnit[]): Edge[] {
  const edges: Edge[] = []
  for (const unit of units) {
    for (const parentId of unit.parentIds) {
      edges.push({
        id: `${unit.id}:${parentId}:in`,
        source: parentId,
        target: unit.id,
        sourceHandle: 'family-bottom',
        targetHandle: 'family-top',
        type: 'smoothstep',
        className: 'family-line',
      })
    }
    for (const childId of unit.childIds) {
      edges.push({
        id: `${unit.id}:${childId}:out`,
        source: unit.id,
        target: childId,
        sourceHandle: 'family-bottom',
        targetHandle: 'family-top',
        type: 'smoothstep',
        className: 'family-line',
      })
    }
  }

  for (const relationship of graph.relationships) {
    if (relationship.type !== 'spouse') continue
    const status = relationship.status ?? 'unknown'
    const showLabel = ['partner', 'separated', 'divorced', 'widowed'].includes(status)
    edges.push({
      id: `spouse:${relationship.id}`,
      source: relationship.person1Id,
      target: relationship.person2Id,
      sourceHandle: 'spouse-right',
      targetHandle: 'spouse-left',
      type: 'straight',
      className: `spouse-line spouse-${status}`,
      label: showLabel ? SPOUSE_STATUS_LABELS[status] : undefined,
      labelStyle: { fill: '#65706b', fontSize: 9, fontWeight: 700 },
      labelBgStyle: { fill: '#f6f4ed', fillOpacity: 0.95 },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
    })
  }
  return edges
}

export function layoutFamilyTree(
  nodes: Array<PersonFlowNode | ConnectorFlowNode>,
  edges: Edge[],
  units: FamilyUnit[],
): Array<PersonFlowNode | ConnectorFlowNode> {
  const layout = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  layout.setGraph({ rankdir: 'TB', nodesep: 58, ranksep: 92, marginx: 36, marginy: 36 })

  for (const node of nodes) {
    const connector = node.type === 'connector'
    layout.setNode(node.id, { width: connector ? UNIT_SIZE : PERSON_WIDTH, height: connector ? UNIT_SIZE : PERSON_HEIGHT })
  }
  for (const edge of edges.filter((candidate) => !candidate.id.startsWith('spouse:'))) {
    layout.setEdge(edge.source, edge.target, { weight: edge.source.startsWith('family:') ? 3 : 5 })
  }
  dagre.layout(layout)

  const positioned = nodes.map((node) => {
    const point = layout.node(node.id)
    const width = node.type === 'connector' ? UNIT_SIZE : PERSON_WIDTH
    const height = node.type === 'connector' ? UNIT_SIZE : PERSON_HEIGHT
    return { ...node, position: { x: point.x - width / 2, y: point.y - height / 2 } }
  })

  const byId = new Map(positioned.map((node) => [node.id, node]))
  for (const unit of units) {
    if (unit.parentIds.length !== 2) continue
    const connector = byId.get(unit.id)
    const first = byId.get(unit.parentIds[0])
    const second = byId.get(unit.parentIds[1])
    if (!connector || !first || !second) continue
    const center = connector.position.x + UNIT_SIZE / 2
    const y = Math.min(first.position.y, second.position.y)
    first.position = { x: center - PERSON_WIDTH - 12, y }
    second.position = { x: center + 12, y }
  }

  // Dagre optimizes crossings, which can reverse the explicitly requested
  // sibling order when one child has a spouse/descendant branch. Reorder whole
  // descendant branches into the stable child order without persisting layout.
  const orderedUnits = [...units].sort((a, b) => (byId.get(a.id)?.position.y ?? 0) - (byId.get(b.id)?.position.y ?? 0))
  const collectBranch = (rootId: string): Set<string> => {
    const branch = new Set<string>([rootId])
    const visit = (personId: string) => {
      for (const family of units.filter((candidate) => candidate.parentIds.includes(personId))) {
        branch.add(family.id)
        family.parentIds.forEach((parentId) => branch.add(parentId))
        family.childIds.forEach((childId) => { branch.add(childId); visit(childId) })
      }
    }
    visit(rootId)
    return branch
  }

  for (const unit of orderedUnits) {
    if (unit.childIds.length < 2) continue
    const branches = unit.childIds.map(collectBranch)
    const centers = branches.map((branch) => {
      const people = [...branch].map((id) => byId.get(id)).filter((node) => node?.type === 'person')
      const left = Math.min(...people.map((node) => node!.position.x))
      const right = Math.max(...people.map((node) => node!.position.x + PERSON_WIDTH))
      return (left + right) / 2
    })
    const slots = [...centers].sort((a, b) => a - b)
    branches.forEach((branch, index) => {
      const shift = slots[index] - centers[index]
      for (const id of branch) {
        const node = byId.get(id)
        if (node) node.position = { ...node.position, x: node.position.x + shift }
      }
    })
  }

  // Manual couple and branch positioning happens after Dagre, so Dagre can no
  // longer protect cards from overlapping. Resolve every visual row as grouped
  // family clusters, then re-center its connectors under the final parent cards.
  const people = positioned.filter((node): node is PersonFlowNode => node.type === 'person')
  const rows: PersonFlowNode[][] = []
  for (const person of [...people].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)) {
    const row = rows.find((candidate) => Math.abs(candidate[0].position.y - person.position.y) < 4)
    if (row) row.push(person)
    else rows.push([person])
  }

  const familyPairs = [
    ...units.flatMap((unit) => unit.parentIds.length > 1
      ? unit.parentIds.slice(1).map((parentId) => [unit.parentIds[0], parentId] as const)
      : []),
    ...edges.filter((edge) => edge.id.startsWith('spouse:')).map((edge) => [edge.source, edge.target] as const),
  ]

  for (const row of rows) {
    const rowIds = new Set(row.map((node) => node.id))
    const parent = new Map(row.map((node) => [node.id, node.id]))
    const find = (id: string): string => {
      const current = parent.get(id) ?? id
      if (current === id) return current
      const root = find(current)
      parent.set(id, root)
      return root
    }
    const unite = (a: string, b: string) => {
      const rootA = find(a); const rootB = find(b)
      if (rootA !== rootB) parent.set(rootB, rootA)
    }
    familyPairs.forEach(([a, b]) => { if (rowIds.has(a) && rowIds.has(b)) unite(a, b) })

    const components = new Map<string, PersonFlowNode[]>()
    for (const node of row) {
      const root = find(node.id)
      const component = components.get(root) ?? []
      component.push(node)
      components.set(root, component)
    }

    const originalLeft = Math.min(...row.map((node) => node.position.x))
    const originalRight = Math.max(...row.map((node) => node.position.x + PERSON_WIDTH))
    const groups = [...components.values()].map((component) => {
      const ordered = [...component].sort((a, b) => a.position.x - b.position.x || a.id.localeCompare(b.id))
      const originalGroupLeft = Math.min(...ordered.map((node) => node.position.x))
      ordered.forEach((node, index) => { node.position = { ...node.position, x: originalGroupLeft + index * (PERSON_WIDTH + COUPLE_GAP) } })
      return { nodes: ordered, left: originalGroupLeft, width: ordered.length * PERSON_WIDTH + (ordered.length - 1) * COUPLE_GAP }
    }).sort((a, b) => a.left - b.left)

    let cursor = groups[0]?.left ?? 0
    for (const group of groups) {
      const left = Math.max(group.left, cursor)
      const shift = left - group.left
      group.nodes.forEach((node) => { node.position = { ...node.position, x: node.position.x + shift } })
      cursor = left + group.width + FAMILY_GROUP_GAP
    }

    const resolvedLeft = Math.min(...row.map((node) => node.position.x))
    const resolvedRight = Math.max(...row.map((node) => node.position.x + PERSON_WIDTH))
    const centerShift = (originalLeft + originalRight - resolvedLeft - resolvedRight) / 2
    row.forEach((node) => { node.position = { ...node.position, x: node.position.x + centerShift } })
  }

  for (const unit of units) {
    const connector = byId.get(unit.id)
    const parents = unit.parentIds.map((id) => byId.get(id)).filter((node): node is PersonFlowNode => node?.type === 'person')
    if (!connector || !parents.length) continue
    const parentCenter = parents.reduce((sum, node) => sum + node.position.x + PERSON_WIDTH / 2, 0) / parents.length
    connector.position = { ...connector.position, x: parentCenter - UNIT_SIZE / 2 }
  }

  return positioned
}
