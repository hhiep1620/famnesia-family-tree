import { describe, expect, it } from 'vitest'
import { selectedFolderId } from '../services/googleWorkspacePicker'

const picker = {
  Action: { PICKED: 'picked', CANCEL: 'cancel' },
  Response: { DOCUMENTS: 'docs' },
  Document: { ID: 'id' },
}

describe('Google Workspace Picker response', () => {
  it('returns the selected folder id', () => {
    expect(selectedFolderId({ action: 'picked', docs: [{ id: 'shared-folder-123' }] }, picker)).toBe('shared-folder-123')
  })

  it('ignores cancellation and malformed responses', () => {
    expect(selectedFolderId({ action: 'cancel' }, picker)).toBeUndefined()
    expect(selectedFolderId({ action: 'picked', docs: [] }, picker)).toBeUndefined()
  })
})
