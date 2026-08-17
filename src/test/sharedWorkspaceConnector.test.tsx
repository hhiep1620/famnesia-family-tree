import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SharedWorkspaceConnector } from '../components/data/SharedWorkspaceConnector'

describe('SharedWorkspaceConnector backend mode', () => {
  it('renders an invitation-link form for Supabase without Drive Picker copy', () => {
    const markup = renderToStaticMarkup(<SharedWorkspaceConnector mode="invite" />)
    expect(markup).toContain('Dán link mời Famnesia')
    expect(markup).toContain('Kết nối bằng link mời')
    expect(markup).not.toContain('Chọn thư mục Famnesia')
  })

  it('keeps the folder picker presentation for Drive rollback mode', () => {
    const markup = renderToStaticMarkup(<SharedWorkspaceConnector mode="drive" onConnect={async () => undefined} />)
    expect(markup).toContain('Chọn thư mục Famnesia')
    expect(markup).toContain('Kết nối gia đình được chia sẻ')
    expect(markup).not.toContain('Dán link mời Famnesia')
  })
})
