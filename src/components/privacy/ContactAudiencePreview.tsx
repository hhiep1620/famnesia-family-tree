import type { ContactPolicyDecision, ContactPolicyRule } from '../../privacy/contactPolicy'

interface Props {
  rule: ContactPolicyRule
  decisions: ContactPolicyDecision[]
  displayNameByPersonId: ReadonlyMap<string, string>
  onChange: (rule: ContactPolicyRule) => void
  disabled?: boolean
}

const audienceLabels: Record<ContactPolicyRule['audience'], string> = {
  self_only: 'Chỉ chính người này',
  direct_family: 'Gia đình trực tiếp',
  close_blood: 'Họ hàng huyết thống gần',
  blood_only: 'Chỉ quan hệ huyết thống',
  workspace_members: 'Mọi thành viên workspace',
  custom: 'Tùy chỉnh từ danh sách trống',
}

export function ContactAudiencePreview({ rule, decisions, displayNameByPersonId, onChange, disabled }: Props) {
  const override = (principalId: string, action: 'default' | 'allow' | 'deny') => {
    const allowPrincipalIds = rule.allowPrincipalIds.filter((id) => id !== principalId)
    const denyPrincipalIds = rule.denyPrincipalIds.filter((id) => id !== principalId)
    if (action === 'allow') allowPrincipalIds.push(principalId)
    if (action === 'deny') denyPrincipalIds.push(principalId)
    onChange({ ...rule, allowPrincipalIds: [...allowPrincipalIds].sort(), denyPrincipalIds: [...denyPrincipalIds].sort() })
  }
  return <section className="contact-audience-preview" aria-labelledby="contact-audience-title">
    <header><div><span className="eyebrow">Quyền riêng tư liên hệ</span><h3 id="contact-audience-title">Ai sẽ được xem?</h3></div></header>
    <label className="field"><span>Audience mặc định</span><select value={rule.audience} disabled={disabled}
      onChange={(event) => onChange({ ...rule, audience: event.target.value as ContactPolicyRule['audience'] })}>
      {Object.entries(audienceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    <p>Đường đi qua vợ/chồng rồi sang họ hàng bên vợ/chồng không được cấp quyền mặc định. Từ chối rõ ràng luôn thắng cho phép.</p>
    <div className="contact-audience-list">{decisions.map((decision) => {
      const overrideValue = rule.denyPrincipalIds.includes(decision.principalId) ? 'deny'
        : rule.allowPrincipalIds.includes(decision.principalId) ? 'allow' : 'default'
      return <div className="contact-audience-row" key={decision.principalId}>
        <span><strong>{displayNameByPersonId.get(decision.personId) ?? decision.personId}</strong><small>{decision.allowed ? 'Được xem' : 'Không được xem'} · {decision.reason}</small></span>
        <select aria-label={`Quyền tùy chỉnh cho ${displayNameByPersonId.get(decision.personId) ?? decision.personId}`}
          value={overrideValue} disabled={disabled} onChange={(event) => override(decision.principalId, event.target.value as 'default' | 'allow' | 'deny')}>
          <option value="default">Theo audience</option><option value="allow">Cho phép rõ ràng</option><option value="deny">Từ chối rõ ràng</option>
        </select>
      </div>
    })}</div>
  </section>
}
