import { ChevronsDownUp, ChevronsUpDown, CornerUpLeft, LocateFixed } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Background, Controls, Panel, ReactFlow, ReactFlowProvider, useReactFlow,
  type NodeMouseHandler, type NodeTypes,
} from '@xyflow/react'
import { calculateAllGenerations } from '../../generation/generationEngine'
import { createFamilyUnits } from '../../graph/familyUnits'
import { createBranchVisibleGraph, type CollateralVisibility } from '../../lineage/branchVisibility'
import { createPrimaryMediaMap } from '../../media/mediaSelectors'
import type { FamilyEventType, FamilyGraph, KinshipResult, PersonMedia } from '../../types/family'
import { addGenerationBands, createFlowEdges, createFlowNodes, layoutFamilyTree, PERSON_HEIGHT, PERSON_WIDTH } from '../../layout/familyLayout'
import { FamilyBranchEdge } from './FamilyBranchEdge'
import { FamilyConnectorNode } from './FamilyConnectorNode'
import { GenerationBandNode } from './GenerationBandNode'
import { PersonNode } from './PersonNode'

const nodeTypes: NodeTypes = { person: PersonNode, connector: FamilyConnectorNode, generationBand: GenerationBandNode }
const edgeTypes = { familyBranch: FamilyBranchEdge }
const ALL_DEPTH = 99

interface CanvasProps {
  graph: FamilyGraph
  workspaceId?: string
  selectedId?: string
  subjectId?: string
  subjectName?: string
  kinships?: Map<string, KinshipResult>
  highlightedIds?: Set<string>
  eventTypes?: Map<string, FamilyEventType>
  filterActive?: boolean
  media?: PersonMedia[]
  canGoBack?: boolean
  onBack?: () => void
  onOpenBranch?: (personId: string) => void
  onSelect: (personId?: string) => void
}

function DepthSelect({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(Number(event.target.value))} aria-label={label}><option value={1}>1 đời</option><option value={2}>2 đời</option><option value={3}>3 đời</option><option value={ALL_DEPTH}>Tất cả</option></select></label>
}

function FamilyTreeCanvas({ graph, workspaceId, selectedId, subjectId, subjectName, kinships, highlightedIds, eventTypes, filterActive, media = [], canGoBack, onBack, onOpenBranch, onSelect }: CanvasProps) {
  const flow = useReactFlow()
  const [ancestorDepth, setAncestorDepth] = useState(() => window.innerWidth <= 760 ? 1 : 2)
  const [descendantDepth, setDescendantDepth] = useState(1)
  const [collateral, setCollateral] = useState<CollateralVisibility>('immediate')
  const [expandedPersonIds, setExpandedPersonIds] = useState<Set<string>>(new Set())
  const visible = useMemo(() => createBranchVisibleGraph(graph, subjectId, { ancestorDepth, descendantDepth, collateral, expandedPersonIds }), [ancestorDepth, collateral, descendantDepth, expandedPersonIds, graph, subjectId])
  const units = useMemo(() => createFamilyUnits(visible.graph), [visible.graph])
  const primaryPhotoIds = useMemo(() => new Map([...createPrimaryMediaMap(media)].map(([personId, item]) => [personId, item.driveFileId])), [media])
  const generations = useMemo(() => subjectId ? calculateAllGenerations(subjectId, graph) : new Map<string, number>(), [graph, subjectId])
  const expandBranch = useCallback((personId: string) => setExpandedPersonIds((current) => new Set(current).add(personId)), [])
  const { nodes, edges } = useMemo(() => {
    const nextNodes = createFlowNodes(visible.graph, units, workspaceId, { subjectId, kinships, highlightedIds, eventTypes, filterActive, primaryPhotoIds, hiddenCounts: visible.hiddenCounts, onExpandBranch: expandBranch })
    const nextEdges = createFlowEdges(visible.graph, units)
    const positioned = layoutFamilyTree(nextNodes, nextEdges, units, { graph, subjectId, kinships })
    return { nodes: addGenerationBands(positioned, generations), edges: nextEdges }
  }, [workspaceId, eventTypes, expandBranch, filterActive, generations, graph, highlightedIds, kinships, primaryPhotoIds, subjectId, units, visible.graph, visible.hiddenCounts])

  const selectedNodes = useMemo(() => nodes.map((node) => ({ ...node, selected: node.type === 'person' && node.id === selectedId })), [nodes, selectedId])

  const centerSubject = useCallback((duration = 450) => {
    if (!subjectId) return
    const node = nodes.find((candidate) => candidate.id === subjectId)
    if (!node) return
    const zoom = window.innerWidth <= 760 ? 0.56 : 0.72
    const verticalBias = window.innerWidth <= 760 ? 35 : 105
    void flow.setCenter(node.position.x + PERSON_WIDTH / 2, node.position.y + PERSON_HEIGHT / 2 - verticalBias / zoom, { zoom, duration })
  }, [flow, nodes, subjectId])

  useEffect(() => {
    setAncestorDepth(window.innerWidth <= 760 ? 1 : 2)
    setDescendantDepth(1)
    setCollateral('immediate')
    setExpandedPersonIds(new Set())
  }, [subjectId])

  useEffect(() => {
    if (selectedId || !subjectId) return
    const frame = requestAnimationFrame(() => centerSubject(400))
    return () => cancelAnimationFrame(frame)
  }, [ancestorDepth, centerSubject, collateral, descendantDepth, expandedPersonIds, selectedId, subjectId])

  useEffect(() => {
    if (!selectedId) return
    const node = nodes.find((candidate) => candidate.type === 'person' && candidate.id === selectedId)
    if (!node) return
    void flow.setCenter(node.position.x + PERSON_WIDTH / 2, node.position.y + PERSON_HEIGHT / 2, { zoom: 1.1, duration: 500 })
  }, [flow, nodes, selectedId])

  useEffect(() => {
    let frame = 0
    const refit = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => centerSubject(250)) }
    window.addEventListener('resize', refit)
    return () => { window.removeEventListener('resize', refit); cancelAnimationFrame(frame) }
  }, [centerSubject])

  const handleNodeClick: NodeMouseHandler = (_, node) => { if (node.type === 'person') onSelect(node.id) }
  const handleNodeDoubleClick: NodeMouseHandler = (_, node) => { if (node.type === 'person') onOpenBranch?.(node.id) }
  const collapseAll = () => { setAncestorDepth(1); setDescendantDepth(1); setCollateral('immediate'); setExpandedPersonIds(new Set()) }
  const expandAll = () => {
    if (graph.personsById.size > 500 && !window.confirm(`Gia phả có ${graph.personsById.size.toLocaleString('vi-VN')} người. Mở toàn bộ có thể làm trình duyệt chậm. Tiếp tục?`)) return
    setAncestorDepth(ALL_DEPTH); setDescendantDepth(ALL_DEPTH); setCollateral('all'); setExpandedPersonIds(new Set())
  }

  return <ReactFlow
    nodes={selectedNodes}
    edges={edges}
    edgeTypes={edgeTypes}
    nodeTypes={nodeTypes}
    onNodeClick={handleNodeClick}
    onNodeDoubleClick={handleNodeDoubleClick}
    onPaneClick={() => onSelect(undefined)}
    minZoom={0.2}
    maxZoom={1.8}
    proOptions={{ hideAttribution: true }}
    nodesDraggable={false}
    nodesConnectable={false}
    selectionOnDrag={false}
    className="family-canvas"
  >
    <Background color="#d8d5cb" gap={28} size={1} />
    <Controls position="bottom-left" showInteractive={false} />
    {subjectId && <Panel position="top-left" className="tree-branch-guide" aria-label="Hướng các nhánh gia đình">{canGoBack && <button type="button" onClick={onBack} aria-label="Quay lại chủ thể trước"><CornerUpLeft size={14} /></button>}<span>← Họ nội</span><strong>{subjectName ?? 'Chủ thể'}</strong><span>Họ ngoại →</span></Panel>}
    {subjectId && <Panel position="bottom-center" className="tree-visibility-controls">
      <DepthSelect label="Tổ tiên" value={ancestorDepth} onChange={setAncestorDepth} />
      <DepthSelect label="Hậu duệ" value={descendantDepth} onChange={setDescendantDepth} />
      <label><span>Nhánh ngang</span><select value={collateral} onChange={(event) => setCollateral(event.target.value as CollateralVisibility)} aria-label="Nhánh ngang"><option value="immediate">Gần</option><option value="extended">Mở rộng</option><option value="all">Tất cả</option></select></label>
      <button type="button" onClick={collapseAll} title="Thu gọn tất cả"><ChevronsDownUp size={15} /></button>
      <button type="button" onClick={expandAll} title="Mở rộng tất cả"><ChevronsUpDown size={15} /></button>
      <button type="button" onClick={() => centerSubject()} title="Đưa chủ thể về giữa"><LocateFixed size={15} /></button>
    </Panel>}
  </ReactFlow>
}

export function FamilyTree(props: CanvasProps) {
  return <ReactFlowProvider><FamilyTreeCanvas {...props} /></ReactFlowProvider>
}
