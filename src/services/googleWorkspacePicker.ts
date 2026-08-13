import { apiRequest } from './apiClient'

interface PickerSession {
  accessToken: string
  apiKey: string
  appId: string
}

interface PickerView {
  setIncludeFolders(value: boolean): PickerView
  setSelectFolderEnabled(value: boolean): PickerView
  setOwnedByMe(value: boolean): PickerView
}

interface PickerDialog { setVisible(value: boolean): void }

interface PickerBuilder {
  setOAuthToken(value: string): PickerBuilder
  setDeveloperKey(value: string): PickerBuilder
  setAppId(value: string): PickerBuilder
  setOrigin(value: string): PickerBuilder
  setLocale(value: string): PickerBuilder
  setTitle(value: string): PickerBuilder
  setMaxItems(value: number): PickerBuilder
  addView(value: PickerView): PickerBuilder
  setCallback(value: (response: Record<string, unknown>) => void): PickerBuilder
  build(): PickerDialog
}

interface GooglePicker {
  Action: { PICKED: string; CANCEL: string }
  Response: { DOCUMENTS: string }
  Document: { ID: string }
  ViewId: { FOLDERS: string }
  DocsView: new (viewId: string) => PickerView
  PickerBuilder: new () => PickerBuilder
}

interface GoogleApiWindow extends Window {
  gapi?: { load(name: string, options: (() => void) | { callback: () => void; onerror: () => void; timeout: number; ontimeout: () => void }): void }
  google?: { picker?: GooglePicker }
}

const PICKER_SCRIPT_ID = 'famnesia-google-picker-api'
let pickerLoader: Promise<GooglePicker> | undefined

export function selectedFolderId(response: Record<string, unknown>, picker: Pick<GooglePicker, 'Action' | 'Response' | 'Document'>): string | undefined {
  if (response.action !== picker.Action.PICKED) return undefined
  const documents = response[picker.Response.DOCUMENTS]
  if (!Array.isArray(documents) || !documents.length || typeof documents[0] !== 'object' || documents[0] === null) return undefined
  const value = (documents[0] as Record<string, unknown>)[picker.Document.ID]
  return typeof value === 'string' && value ? value : undefined
}

function initializePicker(browser: GoogleApiWindow, resolve: (picker: GooglePicker) => void, reject: (error: Error) => void) {
  if (!browser.gapi) { reject(new Error('Không thể khởi tạo Google Picker.')); return }
  const ready = () => browser.google?.picker ? resolve(browser.google.picker) : reject(new Error('Google Picker chưa sẵn sàng.'))
  browser.gapi.load('picker', { callback: ready, onerror: () => reject(new Error('Không thể tải Google Picker.')), timeout: 10_000, ontimeout: () => reject(new Error('Google Picker phản hồi quá chậm.')) })
}

function loadGooglePicker(): Promise<GooglePicker> {
  const browser = window as GoogleApiWindow
  if (browser.google?.picker) return Promise.resolve(browser.google.picker)
  if (pickerLoader) return pickerLoader
  const loading = new Promise<GooglePicker>((resolve, reject) => {
    const existing = document.getElementById(PICKER_SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      if (browser.gapi) { initializePicker(browser, resolve, reject); return }
      existing.addEventListener('load', () => initializePicker(browser, resolve, reject), { once: true })
      existing.addEventListener('error', () => reject(new Error('Không thể tải Google Picker.')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.id = PICKER_SCRIPT_ID
    script.src = 'https://apis.google.com/js/api.js'
    script.async = true
    script.defer = true
    script.addEventListener('load', () => initializePicker(browser, resolve, reject), { once: true })
    script.addEventListener('error', () => reject(new Error('Không thể tải Google Picker.')), { once: true })
    document.head.append(script)
  }).catch((error) => { pickerLoader = undefined; throw error })
  pickerLoader = loading
  return loading
}

export async function chooseSharedFamnesiaWorkspace(): Promise<string | undefined> {
  const session = await apiRequest<PickerSession>('/api/auth/session?resource=picker', { method: 'POST' })
  const picker = await loadGooglePicker()
  return new Promise((resolve) => {
    const folders = new picker.DocsView(picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setOwnedByMe(false)
    const dialog = new picker.PickerBuilder()
      .setOAuthToken(session.accessToken)
      .setDeveloperKey(session.apiKey)
      .setAppId(session.appId)
      .setOrigin(window.location.origin)
      .setLocale('vi')
      .setTitle('Chọn thư mục Famnesia được chia sẻ')
      .setMaxItems(1)
      .addView(folders)
      .setCallback((response) => {
        if (response.action === picker.Action.CANCEL) { resolve(undefined); return }
        const folderId = selectedFolderId(response, picker)
        if (folderId) resolve(folderId)
      })
      .build()
    dialog.setVisible(true)
  })
}
