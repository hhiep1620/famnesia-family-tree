import { LocateFixed, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Background, Controls, Panel, ReactFlow, ReactFlowProvider, useReactFlow,
  type NodeMouseHandler, type NodeTypes,
} from '@xyflow/react'
import { createFocusedFamilyGraph } from '../../graph/focusedFamilyGraph'
import { createFamilyUnits } from '../../graph/familyUnits'
import type { FamilyGraph } from '../../types/family'
import type { FamilyEventType, KinshipResult } from '../../types/family'
import { createFlowEdges, createFlowNodes, layoutFamilyTree, PERSON_HEIGHT, PERSON_WIDTH } from '../../layout/familyLayout'
import { FamilyBranchEdge } from './FamilyBranchEdge'
import { FamilyConnectorNode } from './FamilyConnectorNode'
import { PersonNode } from './PersonNode'

const nodeTypes: NodeTypes = { person: PersonNode, connector: FamilyConnectorNode }
const edgeTypes = { familyBranch: FamilyBranchEdge }

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
  const [depth, setDepth] = useState(2)
  const focused = useMemo(() => createFocusedFamilyGraph(graph, subjectId, depth), [depth, graph, subjectId])
  const units = useMemo(() => createFamilyUnits(focused.graph), [focused.graph])
  const { nodes, edges } = useMemo(() => {
    const nextNodes = createFlowNodes(focused.graph, units, workspaceId, { subjectId, kinships, highlightedIds, eventTypes, filterActive })
    const nextEdges = createFlowEdges(focused.graph, units)
    return { nodes: layoutFamilyTree(nextNodes, nextEdges, units, { graph, subjectId, kinships }), edges: nextEdges }
  }, [workspaceId, eventTypes, filterActive, focused.graph, graph, highlightedIds, kinships, subjectId, units])

  const selectedNodes = useMemo(() => nodes.map((node) => ({ ...node, selected: node.id === selectedId })), [nodes, selectedId])

  const centerSubject = useCallback((duration = 450) => {
    if (!subjectId) return
    const node = nodes.find((candidate) => candidate.id === subjectId)
    if (!node) return
    const zoom = window.innerWidth <= 760 ? 0.52 : 0.68
    void flow.setCenter(node.position.x + PERSON_WIDTH / 2, node.position.y + PERSON_HEIGHT / 2, { zoom, duration })
  }, [flow, nodes, subjectId])

  useEffect(() => {
    setDepth(2)
  }, [subjectId])

  useEffect(() => {
    if (!selectedId) return
    const selectedDepth = focused.distances.get(selectedId)
    if (selectedDepth !== undefined && selectedDepth > depth) setDepth(selectedDepth)
  }, [depth, focused.distances, selectedId])

  useEffect(() => {
    if (selectedId) return
    const frame = requestAnimationFrame(() => centerSubject(400))
    return () => cancelAnimationFrame(frame)
  }, [centerSubject, depth, selectedId])

  useEffect(() => {
    if (!selectedId) return
    const node = nodes.find((candidate) => candidate.id === selectedId)
    if (!node) return
    const width = node.type === 'person' ? PERSON_WIDTH : 14
    const height = node.type === 'person' ? PERSON_HEIGHT : 14
    void flow.setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: 1.15, duration: 550 })
  }, [flow, nodes, selectedId])

  useEffect(() => {
    let frame = 0
    const refit = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => centerSubject(250))
    }
    window.addEventListener('resize', refit)
    return () => { window.removeEventListener('resize', refit); cancelAnimationFrame(frame) }
  }, [centerSubject])

  const handleNodeClick: NodeMouseHandler = (_, node) => {
    if (node.type === 'person') onSelect(node.id)
  }

  return (
    <ReactFlow
      nodes={selectedNodes}
      edges={edges}
      edgeTypes={edgeTypes}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      onPaneClick={() => onSelect(undefined)}
      minZoom={0.25}
      maxZoom={1.8}
      proOptions={{ hideAttribution: true }}
      nodesDraggable={false}
      nodesConnectable={false}
      selectionOnDrag={false}
      className="family-canvas"
    >
      <Background color="#d8d5cb" gap={28} size={1} />
      <Controls position="bottom-left" showInteractive={false} />
      {subjectId && <Panel position="top-left" className="tree-branch-guide" aria-label="Hướng các nhánh gia đình"><span>← Họ nội</span><strong>Tôi</strong><span>Họ ngoại · bên vợ/chồng →</span></Panel>}
      {subjectId && focused.maxDepth > 0 && <Panel position="bottom-center" className="tree-depth-controls">
        <button type="button" disabled={depth <= 1} onClick={() => setDepth((value) => Math.max(1, value - 1))} aria-label="Thu gọn cây gia đình"><Minus size={15} /></button>
        <span aria-live="polite">Mức {Math.min(depth, focused.maxDepth)}/{focused.maxDepth}</span>
        <button type="button" disabled={depth >= focused.maxDepth} onClick={() => setDepth((value) => Math.min(focused.maxDepth, value + 1))} aria-label="Mở rộng cây gia đình"><Plus size={15} /></button>
        <button type="button" onClick={() => centerSubject()} aria-label="Đưa chủ thể về giữa"><LocateFixed size={15} /></button>
      </Panel>}
    </ReactFlow>
  )
}

export function FamilyTree(props: CanvasProps) {
  return <ReactFlowProvider><FamilyTreeCanvas {...props} /></ReactFlowProvider>
}
