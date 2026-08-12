import logoUrl from '../../asset/Logo_text.png'
import iconUrl from '../../asset/ic_launcher-web.png'

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-logo ${compact ? 'is-compact' : ''}`} role="img" aria-label="Famnesia">
      <img className="brand-wordmark" src={logoUrl} alt="" />
      {compact && <img className="brand-app-icon" src={iconUrl} alt="" />}
    </span>
  )
}
