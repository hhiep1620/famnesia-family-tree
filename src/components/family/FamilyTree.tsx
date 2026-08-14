import { ChevronsDownUp, ChevronsUpDown, CornerUpLeft, LocateFixed, Minus, Plus, SlidersHorizontal, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Background, Controls, Panel, ReactFlow, ReactFlowProvider, useReactFlow,
  type NodeMouseHandler, type NodeTypes,
} from '@xyflow/react'
import { calculateAllGenerations, calculateGenerationOrdinals } from '../../generation/generationEngine'
import { createFamilyUnits } from '../../graph/familyUnits'
import { createBranchVisibleGraph, type CollateralVisibility } from '../../lineage/branchVisibility'
import { createPrimaryMediaMap } from '../../media/mediaSelectors'
import { mediaReferenceId } from '../../services/mediaReference'
import type { FamilyEventType, FamilyGraph, KinshipResult, PersonMedia } from '../../types/family'
import { addGenerationBands, createFlowEdges, createFlowNodes, layoutFamilyTree, PERSON_HEIGHT, PERSON_WIDTH } from '../../layout/familyLayout'
import { FamilyBranchEdge } from './FamilyBranchEdge'
import { FamilyConnectorNode } from './FamilyConnectorNode'
import { GenerationBandNode } from './GenerationBandNode'
import { PersonNode } from './PersonNode'

const nodeTypes: NodeTypes = { person: PersonNode, connector: FamilyConnectorNode, generationBand: GenerationBandNode }
const edgeTypes = { familyBranch: FamilyBranchEdge }
const ALL_DEPTH = 99
const DEPTH_LEVELS = [1, 2, 3, ALL_DEPTH]

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

function depthLabel(value: number): string {
  return value === ALL_DEPTH ? 'Tất cả' : `${value} đời`
}

function DepthStepper({ label, help, value, onChange }: { label: string; help: string; value: number; onChange: (value: number) => void }) {
  const index = DEPTH_LEVELS.indexOf(value)
  return <div className="tree-depth-setting">
    <div><strong>{label}</strong><small>{help}</small></div>
    <div className="tree-depth-stepper">
      <button type="button" disabled={index <= 0} onClick={() => onChange(DEPTH_LEVELS[index - 1])} aria-label={`Giảm phạm vi ${label.toLocaleLowerCase('vi')}`}><Minus size={14} /></button>
      <output aria-live="polite">{depthLabel(value)}</output>
      <button type="button" disabled={index >= DEPTH_LEVELS.length - 1} onClick={() => onChange(DEPTH_LEVELS[index + 1])} aria-label={`Tăng phạm vi ${label.toLocaleLowerCase('vi')}`}><Plus size={14} /></button>
    </div>
  </div>
}

function ScopeLauncher({ ancestorDepth, descendantDepth, collateral, onOpen }: { ancestorDepth: number; descendantDepth: number; collateral: CollateralVisibility; onOpen: () => void }) {
  const collateralLabel = collateral === 'immediate' ? 'Gần' : collateral === 'extended' ? 'Mở rộng' : 'Tất cả'
  return <button className="tree-scope-launcher" type="button" onClick={onOpen} aria-label="Mở điều khiển phạm vi cây" aria-expanded="false">
    <SlidersHorizontal size={15} />
    <span><strong>Phạm vi cây</strong><small>Trên {depthLabel(ancestorDepth)} · Dưới {depthLabel(descendantDepth)} · Nhánh {collateralLabel}</small></span>
  </button>
}

function FamilyTreeCanvas({ graph, workspaceId, selectedId, subjectId, subjectName, kinships, highlightedIds, eventTypes, filterActive, media = [], canGoBack, onBack, onOpenBranch, onSelect }: CanvasProps) {
  const flow = useReactFlow()
  const [flowReady, setFlowReady] = useState(false)
  const [ancestorDepth, setAncestorDepth] = useState(() => window.innerWidth <= 760 ? 1 : 2)
  const [descendantDepth, setDescendantDepth] = useState(1)
  const [collateral, setCollateral] = useState<CollateralVisibility>('immediate')
  const [expandedPersonIds, setExpandedPersonIds] = useState<Set<string>>(new Set())
  const [collapsedPersonIds, setCollapsedPersonIds] = useState<Set<string>>(new Set())
  const [revealAllBranches, setRevealAllBranches] = useState(false)
  const [scopeOpen, setScopeOpen] = useState(false)

  const visible = useMemo(() => createBranchVisibleGraph(graph, subjectId, {
    ancestorDepth, descendantDepth, collateral, expandedPersonIds, collapsedPersonIds, revealAllBranches,
  }), [ancestorDepth, collapsedPersonIds, collateral, descendantDepth, expandedPersonIds, graph, revealAllBranches, subjectId])
  const units = useMemo(() => createFamilyUnits(visible.graph), [visible.graph])
  const siblingGroupMemberIds = useMemo(() => new Set(
    createFamilyUnits(graph).filter((unit) => unit.childIds.length > 1).flatMap((unit) => unit.childIds),
  ), [graph])
  const primaryPhotoIds = useMemo(() => new Map([...createPrimaryMediaMap(media)].flatMap(([personId, item]) => {
    const reference = mediaReferenceId(item)
    return reference ? [[personId, reference] as const] : []
  })), [media])
  const generations = useMemo(() => subjectId ? calculateAllGenerations(subjectId, graph) : new Map<string, number>(), [graph, subjectId])
  const generationOrdinals = useMemo(() => calculateGenerationOrdinals(generations), [generations])
  const branchExpandedIds = useMemo(() => {
    if (!revealAllBranches) return expandedPersonIds
    return new Set([...visible.graph.personsById.keys()].filter((personId) => !collapsedPersonIds.has(personId)))
  }, [collapsedPersonIds, expandedPersonIds, revealAllBranches, visible.graph.personsById])

  const expandBranch = useCallback((personId: string) => {
    setCollapsedPersonIds((current) => { const next = new Set(current); next.delete(personId); return next })
    setExpandedPersonIds((current) => new Set(current).add(personId))
  }, [])
  const collapseBranch = useCallback((personId: string) => {
    setExpandedPersonIds((current) => { const next = new Set(current); next.delete(personId); return next })
    setCollapsedPersonIds((current) => new Set(current).add(personId))
  }, [])

  const { nodes, edges } = useMemo(() => {
    const nextNodes = createFlowNodes(visible.graph, units, workspaceId, {
      subjectId, kinships, highlightedIds, eventTypes, filterActive, primaryPhotoIds,
      hiddenCounts: visible.hiddenCounts, expandedPersonIds: branchExpandedIds,
      siblingGroupMemberIds,
      onExpandBranch: expandBranch, onCollapseBranch: collapseBranch,
    })
    const nextEdges = createFlowEdges(visible.graph, units)
    const positioned = layoutFamilyTree(nextNodes, nextEdges, units, { graph, subjectId, kinships })
    return { nodes: addGenerationBands(positioned, generations, generationOrdinals), edges: nextEdges }
  }, [workspaceId, branchExpandedIds, collapseBranch, eventTypes, expandBranch, filterActive, generationOrdinals, generations, graph, highlightedIds, kinships, primaryPhotoIds, siblingGroupMemberIds, subjectId, units, visible.graph, visible.hiddenCounts])

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
    setCollapsedPersonIds(new Set())
    setRevealAllBranches(false)
    setScopeOpen(false)
  }, [subjectId])

  useEffect(() => {
    if (selectedId || !subjectId || !flowReady) return
    let secondFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => centerSubject(400))
    })
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame) }
  }, [ancestorDepth, centerSubject, collapsedPersonIds, collateral, descendantDepth, expandedPersonIds, flowReady, revealAllBranches, selectedId, subjectId])

  useEffect(() => {
    if (!selectedId || !flowReady) return
    const node = nodes.find((candidate) => candidate.type === 'person' && candidate.id === selectedId)
    if (!node) return
    void flow.setCenter(node.position.x + PERSON_WIDTH / 2, node.position.y + PERSON_HEIGHT / 2, { zoom: 1.1, duration: 500 })
  }, [flow, flowReady, nodes, selectedId])

  useEffect(() => {
    let frame = 0
    const refit = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => centerSubject(250)) }
    window.addEventListener('resize', refit)
    return () => { window.removeEventListener('resize', refit); cancelAnimationFrame(frame) }
  }, [centerSubject])

  const changeAncestorDepth = (value: number) => { setRevealAllBranches(false); setAncestorDepth(value) }
  const changeDescendantDepth = (value: number) => { setRevealAllBranches(false); setDescendantDepth(value) }
  const changeCollateral = (value: CollateralVisibility) => { setRevealAllBranches(false); setCollateral(value) }
  const collapseAll = () => {
    setAncestorDepth(1); setDescendantDepth(1); setCollateral('immediate')
    setExpandedPersonIds(new Set()); setCollapsedPersonIds(new Set()); setRevealAllBranches(false); setScopeOpen(false)
  }
  const expandAll = () => {
    if (graph.personsById.size > 500 && !window.confirm(`Gia phả có ${graph.personsById.size.toLocaleString('vi-VN')} người. Mở toàn bộ có thể làm trình duyệt chậm. Tiếp tục?`)) return
    setAncestorDepth(ALL_DEPTH); setDescendantDepth(ALL_DEPTH); setCollateral('all')
    setExpandedPersonIds(new Set()); setCollapsedPersonIds(new Set()); setRevealAllBranches(true); setScopeOpen(false)
  }

  const handleNodeClick: NodeMouseHandler = (_, node) => { if (node.type === 'person') onSelect(node.id) }
  const handleNodeDoubleClick: NodeMouseHandler = (_, node) => { if (node.type === 'person') onOpenBranch?.(node.id) }

  return <ReactFlow
    nodes={selectedNodes}
    edges={edges}
    edgeTypes={edgeTypes}
    nodeTypes={nodeTypes}
    onNodeClick={handleNodeClick}
    onNodeDoubleClick={handleNodeDoubleClick}
    onPaneClick={() => onSelect(undefined)}
    onInit={() => setFlowReady(true)}
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
    {subjectId ? <Panel position="top-left" className="tree-branch-guide" aria-label="Hướng các nhánh gia đình">{canGoBack ? <button type="button" onClick={onBack} aria-label="Quay lại chủ thể trước"><CornerUpLeft size={14} /></button> : null}<span>← Họ nội</span><strong>{subjectName ?? 'Chủ thể'}</strong><span>Họ ngoại →</span></Panel> : null}
    {subjectId ? <Panel position="bottom-center" className={scopeOpen ? 'tree-scope-panel' : 'tree-scope-panel is-closed'}>
      {!scopeOpen ? <ScopeLauncher ancestorDepth={ancestorDepth} descendantDepth={descendantDepth} collateral={collateral} onOpen={() => setScopeOpen(true)} /> : <section className="tree-scope-controls" aria-label="Điều khiển phạm vi cây">
        <header><div><strong>Phạm vi hiển thị</strong><small>Chọn số đời và mức mở của các nhánh bên.</small></div><button type="button" onClick={() => setScopeOpen(false)} aria-label="Đóng điều khiển phạm vi"><X size={16} /></button></header>
        <div className="tree-scope-body">
          <DepthStepper label="Tổ tiên phía trên" help="Cha mẹ, ông bà, cụ…" value={ancestorDepth} onChange={changeAncestorDepth} />
          <DepthStepper label="Hậu duệ phía dưới" help="Con, cháu, chắt…" value={descendantDepth} onChange={changeDescendantDepth} />
          <div className="tree-collateral-setting"><div><strong>Nhánh bên</strong><small>Anh chị em, cô chú bác và họ hàng.</small></div><div role="group" aria-label="Mức hiển thị nhánh bên"><button className={collateral === 'immediate' ? 'active' : ''} type="button" onClick={() => changeCollateral('immediate')}>Gần</button><button className={collateral === 'extended' ? 'active' : ''} type="button" onClick={() => changeCollateral('extended')}>Mở rộng</button><button className={collateral === 'all' ? 'active' : ''} type="button" onClick={() => changeCollateral('all')}>Tất cả</button></div></div>
        </div>
        <footer>
          <button type="button" onClick={collapseAll}><ChevronsDownUp size={15} /><span><strong>Về mức cơ bản</strong><small>Cha mẹ, vợ/chồng, con</small></span></button>
          <button type="button" onClick={expandAll}><ChevronsUpDown size={15} /><span><strong>Mở toàn bộ</strong><small>Kể cả nhánh thông gia</small></span></button>
          <button type="button" onClick={() => { centerSubject(); setScopeOpen(false) }}><LocateFixed size={15} /><span><strong>Về chủ thể</strong><small>Đưa card chính vào giữa</small></span></button>
        </footer>
      </section>}
    </Panel> : null}
  </ReactFlow>
}

export function FamilyTree(props: CanvasProps) {
  return <ReactFlowProvider><FamilyTreeCanvas {...props} /></ReactFlowProvider>
}
