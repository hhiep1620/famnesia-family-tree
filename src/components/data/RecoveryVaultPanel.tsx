import { Download, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react'
import { useRef, useState } from 'react'
import { BrowserGoogleDriveAuthorization, parseDriveClientId } from '../../security/googleDriveAuthorization'
import { DriveVaultError, GoogleDriveKeyVaultClient } from '../../security/googleDriveKeyVault'
import { SupabaseRecoveryPrivateKeyRepository } from '../../security/recoveryPrivateKeyRepository'
import { canConfirmRecoveryArtifacts, RecoveryVaultCoordinator, type PendingRecoverySetup } from '../../security/recoveryVaultCoordinator'
import type { RecoveryIdentity } from '../../services/encryptedWorkspaceRuntime'
import { getSupabaseBrowserClient } from '../../services/supabase/browserClient'

function downloadJson(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noreferrer'
  anchor.click()
  URL.revokeObjectURL(url)
}

function createCoordinator() {
  const authorization = new BrowserGoogleDriveAuthorization(parseDriveClientId(import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID))
  return new RecoveryVaultCoordinator(
    new SupabaseRecoveryPrivateKeyRepository(getSupabaseBrowserClient()),
    new GoogleDriveKeyVaultClient(() => authorization.connect(), globalThis.fetch.bind(globalThis), Date.now, () => authorization.clear()),
  )
}

export function RecoveryVaultPanel({ onActive }: { onActive?: (identity: RecoveryIdentity) => void | Promise<void> } = {}) {
  const coordinator = useRef<RecoveryVaultCoordinator>(undefined)
  const [pending, setPending] = useState<PendingRecoverySetup>()
  const [downloadedDriveKit, setDownloadedDriveKit] = useState(false)
  const [downloadedEncryptedBackup, setDownloadedEncryptedBackup] = useState(false)
  const [savedSeparately, setSavedSeparately] = useState(false)
  const [status, setStatus] = useState<'idle' | 'working' | 'active'>('idle')
  const [error, setError] = useState<string>()
  const [canResetPending, setCanResetPending] = useState(false)
  const getCoordinator = () => (coordinator.current ??= createCoordinator())
  const currentEmail = async () => {
    const { data, error: authError } = await getSupabaseBrowserClient().auth.getUser()
    if (authError || !data.user?.email) throw new Error('SUPABASE_USER_EMAIL_REQUIRED')
    return data.user.email
  }

  const prepare = async () => {
    setStatus('working'); setError(undefined); setCanResetPending(false)
    try {
      setPending(await getCoordinator().prepareNewIdentity(await currentEmail()))
      setDownloadedDriveKit(false); setDownloadedEncryptedBackup(false); setSavedSeparately(false); setStatus('idle')
    } catch (caught) {
      setCanResetPending(caught instanceof DriveVaultError && caught.code === 'KEY_VAULT_MISSING')
      setError(caught instanceof Error ? caught.message : 'Không thể thiết lập key vault.'); setStatus('idle')
    }
  }
  const restore = async () => {
    setStatus('working'); setError(undefined)
    try { const identity = await getCoordinator().restore(await currentEmail()); await onActive?.(identity); setStatus('active') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể khôi phục khóa.'); setStatus('idle') }
  }
  const confirm = async () => {
    if (!pending || !canConfirmRecoveryArtifacts(downloadedDriveKit, downloadedEncryptedBackup, savedSeparately)) return
    setStatus('working'); setError(undefined)
    try { const identity = await pending.confirmArtifactsSaved(); await onActive?.(identity); setPending(undefined); setStatus('active') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể kích hoạt key vault.'); setStatus('idle') }
  }
  const resetMissingPending = async () => {
    setStatus('working'); setError(undefined)
    try {
      await getCoordinator().discardPendingAfterConfirmedMissingVault(await currentEmail())
      setCanResetPending(false); setStatus('idle')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể làm lại thiết lập key vault.'); setStatus('idle')
    }
  }

  return <section className="backup-section recovery-vault-panel">
    <div className="backup-heading"><div><span className="section-label">Mã hóa phía người dùng</span><h3><KeyRound size={18} /> Google Drive Key Vault</h3><p>Drive giữ recovery secret; Supabase chỉ giữ private key đã mã hóa. Famnesia không có master key để mở hoặc đặt lại dữ liệu.</p></div>{status === 'active' && <span className="session-badge"><ShieldCheck size={14} /> Đã mở khóa</span>}</div>
    <div className="recovery-warning"><strong>Mất cả Drive secret, recovery kit và mọi thiết bị đã mở khóa có thể làm dữ liệu mất vĩnh viễn.</strong><span>Hai tệp khôi phục phải được tải xuống và cất ở hai nơi riêng biệt trước khi kích hoạt.</span></div>
    {!pending && status !== 'active' && <div className="recovery-actions"><button className="primary-button" disabled={status === 'working'} onClick={() => void prepare()}><KeyRound size={16} /> Thiết lập / tiếp tục</button><button className="secondary-button" disabled={status === 'working'} onClick={() => void restore()}><RefreshCw size={16} /> Khôi phục thiết bị này</button></div>}
    {pending && <div className="recovery-confirmation"><div className="recovery-actions"><button className="secondary-button" aria-pressed={downloadedDriveKit} onClick={() => { downloadJson('famnesia-drive-recovery-kit-v1.json', pending.driveVaultDownload); setDownloadedDriveKit(true) }}><Download size={16} /> {downloadedDriveKit ? 'Đã tải recovery kit' : 'Tải recovery kit'}</button><button className="secondary-button" aria-pressed={downloadedEncryptedBackup} onClick={() => { downloadJson('famnesia-encrypted-user-backup-v1.json', pending.encryptedBackupDownload); setDownloadedEncryptedBackup(true) }}><Download size={16} /> {downloadedEncryptedBackup ? 'Đã tải encrypted backup' : 'Tải encrypted backup'}</button></div><label><input type="checkbox" disabled={!downloadedDriveKit || !downloadedEncryptedBackup} checked={savedSeparately} onChange={(event) => setSavedSeparately(event.target.checked)} /><span>Tôi đã lưu hai tệp ở hai nơi riêng biệt và hiểu Famnesia không thể khôi phục khóa thay tôi.</span></label><button className="primary-button" disabled={!canConfirmRecoveryArtifacts(downloadedDriveKit, downloadedEncryptedBackup, savedSeparately) || status === 'working'} onClick={() => void confirm()}><ShieldCheck size={16} /> Xác nhận và kích hoạt</button></div>}
    {canResetPending && <button className="danger-button" disabled={status === 'working'} onClick={() => void resetMissingPending()}>Xác minh thiếu vault và làm lại</button>}
    {error && <p className="form-error">{error}</p>}
  </section>
}
