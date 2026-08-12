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
const COUPLE_GAP = 48
const GROUP_GAP = 96
const GENERATION_GAP = 300
const CONNECTOR_OFFSET = 48

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
  nodes.push(...units.filter((unit) => unit.childIds.length > 0).map((unit) => ({
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
    if (unit.childIds.length === 0) continue
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
        type: 'familyBranch',
        data: { lane: 0 },
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
  const positioned = nodes.map((node) => ({ ...node, position: { ...node.position } }))
  const people = positioned.filter((node): node is PersonFlowNode => node.type === 'person')
  const byId = new Map(positioned.map((node) => [node.id, node]))
  const parent = new Map(people.map((node) => [node.id, node.id]))
  const find = (id: string): string => {
    const current = parent.get(id) ?? id
    if (current === id) return current
    const root = find(current)
    parent.set(id, root)
    return root
  }
  const unite = (a: string, b: string) => {
    if (!parent.has(a) || !parent.has(b)) return
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootB, rootA)
  }

  for (const unit of units) {
    unit.parentIds.slice(1).forEach((parentId) => unite(unit.parentIds[0], parentId))
  }
  for (const edge of edges) {
    if (edge.id.startsWith('spouse:')) unite(edge.source, edge.target)
  }

  const groups = new Map<string, PersonFlowNode[]>()
  for (const person of people) {
    const root = find(person.id)
    const members = groups.get(root) ?? []
    members.push(person)
    groups.set(root, members)
  }

  const spouseEdges = edges.filter((edge) => edge.id.startsWith('spouse:'))
  for (const members of groups.values()) {
    if (members.length !== 2) continue
    const spouse = spouseEdges.find((edge) => members.some((member) => member.id === edge.source) && members.some((member) => member.id === edge.target))
    if (spouse && members[0].id !== spouse.source) members.reverse()
  }

  const personGroup = new Map<string, string>()
  for (const [groupId, members] of groups) members.forEach((member) => personGroup.set(member.id, groupId))

  const incoming = new Map<string, Set<string>>()
  const layout = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  layout.setGraph({ rankdir: 'TB', nodesep: GROUP_GAP, ranksep: 120, marginx: 48, marginy: 36 })
  for (const [groupId, members] of groups) {
    const width = members.length * PERSON_WIDTH + Math.max(0, members.length - 1) * COUPLE_GAP
    layout.setNode(groupId, { width, height: PERSON_HEIGHT })
  }
  for (const unit of units) {
    const parentGroup = personGroup.get(unit.parentIds[0])
    if (!parentGroup) continue
    for (const childId of unit.childIds) {
      const childGroup = personGroup.get(childId)
      if (!childGroup || childGroup === parentGroup) continue
      const parents = incoming.get(childGroup) ?? new Set<string>()
      parents.add(parentGroup)
      incoming.set(childGroup, parents)
      layout.setEdge(parentGroup, childGroup, { weight: 5 })
    }
  }
  dagre.layout(layout)

  const parentAnchors = new Map<string, number[]>()
  for (const unit of units) {
    const parentGroup = personGroup.get(unit.parentIds[0])
    const parentPoint = parentGroup ? layout.node(parentGroup) : undefined
    if (!parentPoint) continue
    for (const childId of unit.childIds) {
      parentAnchors.set(childId, [...(parentAnchors.get(childId) ?? []), parentPoint.x])
    }
  }
  const anchorOf = (personId: string): number | undefined => {
    const anchors = parentAnchors.get(personId)
    return anchors?.length ? anchors.reduce((sum, value) => sum + value, 0) / anchors.length : undefined
  }

  const generations = new Map<string, number>()
  const generationOf = (groupId: string, visiting = new Set<string>()): number => {
    const cached = generations.get(groupId)
    if (cached !== undefined) return cached
    if (visiting.has(groupId)) return 0
    const nextVisiting = new Set(visiting).add(groupId)
    const parents = [...(incoming.get(groupId) ?? [])]
    const generation = parents.length ? Math.max(...parents.map((parentId) => generationOf(parentId, nextVisiting) + 1)) : 0
    generations.set(groupId, generation)
    return generation
  }

  for (const [groupId, members] of groups) {
    const point = layout.node(groupId)
    const width = members.length * PERSON_WIDTH + Math.max(0, members.length - 1) * COUPLE_GAP
    const left = point.x - width / 2
    const y = 36 + generationOf(groupId) * GENERATION_GAP
    const ordered = [...members].sort((a, b) => {
      const anchorA = anchorOf(a.id)
      const anchorB = anchorOf(b.id)
      if (anchorA !== undefined && anchorB !== undefined && anchorA !== anchorB) return anchorA - anchorB
      return members.indexOf(a) - members.indexOf(b)
    })
    ordered.forEach((member, index) => {
      member.position = { x: left + index * (PERSON_WIDTH + COUPLE_GAP), y }
    })
  }

  for (const edge of spouseEdges) {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target || source.position.x <= target.position.x) continue
    edge.sourceHandle = 'spouse-left-source'
    edge.targetHandle = 'spouse-right-target'
  }

  for (const unit of units) {
    const connector = byId.get(unit.id)
    if (!connector || unit.childIds.length === 0) continue
    const parents = unit.parentIds.map((id) => byId.get(id)).filter((node): node is PersonFlowNode => node?.type === 'person')
    const children = unit.childIds.map((id) => byId.get(id)).filter((node): node is PersonFlowNode => node?.type === 'person')
    if (!parents.length || !children.length) continue
    const parentCenter = parents.reduce((sum, node) => sum + node.position.x + PERSON_WIDTH / 2, 0) / parents.length
    const parentBottom = Math.max(...parents.map((node) => node.position.y + PERSON_HEIGHT))
    const childTop = Math.min(...children.map((node) => node.position.y))
    connector.position = {
      x: parentCenter - UNIT_SIZE / 2,
      y: Math.min(parentBottom + CONNECTOR_OFFSET, childTop - UNIT_SIZE - CONNECTOR_OFFSET),
    }
  }

  const connectorRows = new Map<number, ConnectorFlowNode[]>()
  for (const connector of positioned.filter((node): node is ConnectorFlowNode => node.type === 'connector')) {
    const rowKey = Math.round(connector.position.y)
    const row = connectorRows.get(rowKey) ?? []
    row.push(connector)
    connectorRows.set(rowKey, row)
  }
  for (const row of connectorRows.values()) {
    row.sort((a, b) => a.position.x - b.position.x).forEach((connector, index) => {
      for (const edge of edges) {
        if (edge.source === connector.id && edge.type === 'familyBranch') edge.data = { ...(edge.data ?? {}), lane: index % 2 }
      }
    })
  }

  return positioned
}
