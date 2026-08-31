import { Download, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react'
import { useRef, useState } from 'react'
import { BrowserGoogleDriveAuthorization, parseDriveClientId } from '../../security/googleDriveAuthorization'
import { GoogleDriveKeyVaultClient } from '../../security/googleDriveKeyVault'
import { SupabaseRecoveryPrivateKeyRepository } from '../../security/recoveryPrivateKeyRepository'
import { RecoveryVaultCoordinator, type PendingRecoverySetup } from '../../security/recoveryVaultCoordinator'
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
    new GoogleDriveKeyVaultClient(() => authorization.connect()),
  )
}

export function RecoveryVaultPanel() {
  const coordinator = useRef<RecoveryVaultCoordinator>(undefined)
  const [pending, setPending] = useState<PendingRecoverySetup>()
  const [savedSeparately, setSavedSeparately] = useState(false)
  const [status, setStatus] = useState<'idle' | 'working' | 'active'>('idle')
  const [error, setError] = useState<string>()
  const getCoordinator = () => (coordinator.current ??= createCoordinator())
  const currentEmail = async () => {
    const { data, error: authError } = await getSupabaseBrowserClient().auth.getUser()
    if (authError || !data.user?.email) throw new Error('SUPABASE_USER_EMAIL_REQUIRED')
    return data.user.email
  }

  const prepare = async () => {
    setStatus('working'); setError(undefined)
    try { setPending(await getCoordinator().prepareNewIdentity(await currentEmail())); setStatus('idle') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể thiết lập key vault.'); setStatus('idle') }
  }
  const restore = async () => {
    setStatus('working'); setError(undefined)
    try { await getCoordinator().restore(await currentEmail()); setStatus('active') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể khôi phục khóa.'); setStatus('idle') }
  }
  const confirm = async () => {
    if (!pending || !savedSeparately) return
    setStatus('working'); setError(undefined)
    try { await pending.confirmArtifactsSaved(); setPending(undefined); setStatus('active') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể kích hoạt key vault.'); setStatus('idle') }
  }

  return <section className="backup-section recovery-vault-panel">
    <div className="backup-heading"><div><span className="section-label">Mã hóa phía người dùng</span><h3><KeyRound size={18} /> Google Drive Key Vault</h3><p>Drive giữ recovery secret; Supabase chỉ giữ private key đã mã hóa. Famnesia không có master key để mở hoặc đặt lại dữ liệu.</p></div>{status === 'active' && <span className="session-badge"><ShieldCheck size={14} /> Đã mở khóa</span>}</div>
    <div className="recovery-warning"><strong>Mất cả Drive secret, recovery kit và mọi thiết bị đã mở khóa có thể làm dữ liệu mất vĩnh viễn.</strong><span>Hai tệp khôi phục phải được tải xuống và cất ở hai nơi riêng biệt trước khi kích hoạt.</span></div>
    {!pending && status !== 'active' && <div className="recovery-actions"><button className="primary-button" disabled={status === 'working'} onClick={() => void prepare()}><KeyRound size={16} /> Thiết lập / tiếp tục</button><button className="secondary-button" disabled={status === 'working'} onClick={() => void restore()}><RefreshCw size={16} /> Khôi phục thiết bị này</button></div>}
    {pending && <div className="recovery-confirmation"><div className="recovery-actions"><button className="secondary-button" onClick={() => downloadJson('famnesia-drive-recovery-kit-v1.json', pending.driveVaultDownload)}><Download size={16} /> Tải recovery kit</button><button className="secondary-button" onClick={() => downloadJson('famnesia-encrypted-user-backup-v1.json', pending.encryptedBackupDownload)}><Download size={16} /> Tải encrypted backup</button></div><label><input type="checkbox" checked={savedSeparately} onChange={(event) => setSavedSeparately(event.target.checked)} /><span>Tôi đã lưu hai tệp ở hai nơi riêng biệt và hiểu Famnesia không thể khôi phục khóa thay tôi.</span></label><button className="primary-button" disabled={!savedSeparately || status === 'working'} onClick={() => void confirm()}><ShieldCheck size={16} /> Xác nhận và kích hoạt</button></div>}
    {error && <p className="form-error">{error}</p>}
  </section>
}
