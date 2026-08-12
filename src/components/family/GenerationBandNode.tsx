import type { Node, NodeProps } from '@xyflow/react'

type GenerationBand = Node<{ label: string; description: string }, 'generationBand'>

export function GenerationBandNode({ data }: NodeProps<GenerationBand>) {
  return <div className="generation-band"><strong>{data.label}</strong><span>{data.description}</span></div>
}
