import { Handle, Position } from '@xyflow/react'

export function FamilyConnectorNode() {
  return (
    <div className="family-connector" aria-hidden="true">
      <Handle id="family-top" type="target" position={Position.Top} className="family-handle" />
      <span />
      <Handle id="family-bottom" type="source" position={Position.Bottom} className="family-handle" />
    </div>
  )
}
