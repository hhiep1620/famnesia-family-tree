import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useDriveImage } from '../../hooks/useDriveImage'
import type { PersonFlowNode } from '../../layout/familyLayout'
import { getInitials } from '../../utils/initials'

export function PersonNode({ data, selected }: NodeProps<PersonFlowNode>) {
  const { url, loading } = useDriveImage(data.workspaceId, data.photoFileId)
  return (
    <article className={`person-node ${selected ? 'is-selected' : ''} ${data.isDeceased ? 'is-deceased' : ''} ${data.isDimmed ? 'is-dimmed' : ''}`} aria-label={data.name}>
      <Handle id="family-top" type="target" position={Position.Top} className="family-handle" />
      <Handle id="spouse-left" type="target" position={Position.Left} className="family-handle" />
      <Handle id="spouse-left-source" type="source" position={Position.Left} className="family-handle" />
      <div className="portrait-ring">
        {url ? <img src={url} alt="" /> : <span className={loading ? 'animate-pulse' : ''}>{getInitials(data.name)}</span>}
      </div>
      <div className="person-node-name">{data.name}</div>
      {data.nickname && <div className="person-node-nickname">“{data.nickname}”</div>}
      {data.lifeLabel && <div className="person-node-life">{data.lifeLabel}</div>}
      {data.kinshipLabel && <div className={`kinship-tag ${data.isSubject ? 'is-subject' : ''}`}>{data.kinshipLabel}</div>}
      {(data.hiddenBranchCount || data.isBranchExpanded) ? <div className="branch-node-controls">
        {data.hiddenBranchCount ? <button className="branch-expand-indicator" type="button" onClick={(event) => { event.stopPropagation(); data.onExpandBranch?.(data.personId) }} aria-label={`Mở ${data.hiddenBranchCount} người thân đang ẩn`} title={`Mở thêm ${data.hiddenBranchCount} người`}><ChevronRight size={12} /><span>+{data.hiddenBranchCount}</span></button> : null}
        {data.isBranchExpanded ? <button className="branch-collapse-indicator" type="button" onClick={(event) => { event.stopPropagation(); data.onCollapseBranch?.(data.personId) }} aria-label={`Thu nhánh của ${data.name}`} title="Thu nhánh này"><ChevronLeft size={12} /><span>Thu</span></button> : null}
      </div> : null}
      {data.eventType && <span className={`node-event-marker ${data.eventType}`} title={data.eventType === 'birthday' ? 'Sắp đến sinh nhật' : 'Sắp đến ngày giỗ'} />}
      <Handle id="spouse-right" type="source" position={Position.Right} className="family-handle" />
      <Handle id="spouse-right-target" type="target" position={Position.Right} className="family-handle" />
      <Handle id="family-bottom" type="source" position={Position.Bottom} className="family-handle" />
    </article>
  )
}
