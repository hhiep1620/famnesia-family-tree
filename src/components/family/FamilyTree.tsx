import { useEffect, useMemo } from 'react'
import {
  Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow,
  type NodeMouseHandler, type NodeTypes,
} from '@xyflow/react'
import { createFamilyUnits } from '../../graph/familyUnits'
import type { FamilyGraph } from '../../types/family'
import type { FamilyEventType, KinshipResult } from '../../types/family'
import { createFlowEdges, createFlowNodes, layoutFamilyTree, PERSON_HEIGHT, PERSON_WIDTH } from '../../layout/familyLayout'
import { FamilyConnectorNode } from './FamilyConnectorNode'
import { PersonNode } from './PersonNode'

const nodeTypes: NodeTypes = { person: PersonNode, connector: FamilyConnectorNode }

interface CanvasProps {
  graph: FamilyGraph
  workspaceId?: string
  selectedId?: string
  subjectId?: string
  kinships?: Map<string, KinshipResult>
  highlightedIds?: Set<string>
  eventTypes?: Map<string, FamilyEventType>
  filterActive?: boolean
  onSelect: (personId?: string) => void
}

function FamilyTreeCanvas({ graph, workspaceId, selectedId, subjectId, kinships, highlightedIds, eventTypes, filterActive, onSelect }: CanvasProps) {
  const flow = useReactFlow()
  const units = useMemo(() => createFamilyUnits(graph), [graph])
  const { nodes, edges } = useMemo(() => {
    const nextNodes = createFlowNodes(graph, units, workspaceId, { subjectId, kinships, highlightedIds, eventTypes, filterActive })
    const nextEdges = createFlowEdges(graph, units)
    return { nodes: layoutFamilyTree(nextNodes, nextEdges, units), edges: nextEdges }
  }, [workspaceId, eventTypes, filterActive, graph, highlightedIds, kinships, subjectId, units])

  const selectedNodes = useMemo(() => nodes.map((node) => ({ ...node, selected: node.id === selectedId })), [nodes, selectedId])

  useEffect(() => {
    if (!selectedId) return
    const node = nodes.find((candidate) => candidate.id === selectedId)
    if (!node) return
    const width = node.type === 'person' ? PERSON_WIDTH : 14
    const height = node.type === 'person' ? PERSON_HEIGHT : 14
    void flow.setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: 1.15, duration: 550 })
  }, [flow, nodes, selectedId])

  const handleNodeClick: NodeMouseHandler = (_, node) => {
    if (node.type === 'person') onSelect(node.id)
  }

  return (
    <ReactFlow
      nodes={selectedNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      onPaneClick={() => onSelect(undefined)}
      minZoom={0.25}
      maxZoom={1.8}
      fitView
      fitViewOptions={{ padding: 0.18, maxZoom: 1.05 }}
      proOptions={{ hideAttribution: true }}
      nodesDraggable={false}
      nodesConnectable={false}
      selectionOnDrag={false}
      className="family-canvas"
    >
      <Background color="#d8d5cb" gap={28} size={1} />
      <Controls position="bottom-left" showInteractive={false} />
    </ReactFlow>
  )
}

export function FamilyTree(props: CanvasProps) {
  return <ReactFlowProvider><FamilyTreeCanvas {...props} /></ReactFlowProvider>
}
