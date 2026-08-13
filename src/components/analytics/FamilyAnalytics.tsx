import { CakeSlice, Flower2, MapPin, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { calculateFamilyAnalytics, type AnalyticsScope } from '../../analytics/familyAnalytics'
import { getFamilyEventsForMonth, getUpcomingFamilyEvents } from '../../calendar/familyCalendar'
import type { FamilyData, Person } from '../../types/family'

function BarList({ values }: { values: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...values.map((item) => item.count))
  return <div className="analytics-bars">{values.map((item) => <div key={item.label}><span>{item.label}</span><i><b style={{ width: `${item.count * 100 / max}%` }} /></i><strong>{item.count}</strong></div>)}</div>
}

const GENDER_SEGMENTS = [
  { key: 'male', label: 'Nam', color: '#41665a' },
  { key: 'female', label: 'Nữ', color: '#bf766b' },
  { key: 'other', label: 'Khác', color: '#8b7461' },
  { key: 'unknown', label: 'Không rõ', color: '#d8d3c6' },
] as const

function GenderDonut({ values }: { values: Record<(typeof GENDER_SEGMENTS)[number]['key'], number> }) {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0)
  let cursor = 0
  const gradient = total ? GENDER_SEGMENTS.map((segment) => {
    const start = cursor
    cursor += values[segment.key] * 100 / total
    return `${segment.color} ${start}% ${cursor}%`
  }).join(', ') : '#e7e3da 0 100%'
  const aria = GENDER_SEGMENTS.map((segment) => `${segment.label} ${values[segment.key]}`).join(', ')
  return <div className="gender-chart" role="img" aria-label={`Phân bố giới tính: ${aria}`}>
    <div className="gender-donut" style={{ background: `conic-gradient(${gradient})` }}><span><strong>{total}</strong><small>thành viên</small></span></div>
    <div className="gender-legend">{GENDER_SEGMENTS.filter((segment) => segment.key === 'male' || segment.key === 'female' || values[segment.key] > 0).map((segment) => {
      const count = values[segment.key]
      const percentage = total ? Math.round(count * 100 / total) : 0
      return <div key={segment.key}><i style={{ background: segment.color }} /><span>{segment.label}</span><strong>{count}</strong><small>{percentage}%</small></div>
    })}</div>
  </div>
}

function AgeHistogram({ values }: { values: Record<string, number> }) {
  const unknown = values['Không rõ'] ?? 0
  const bins = Object.entries(values).filter(([label]) => label !== 'Không rõ')
  const max = Math.max(1, ...bins.map(([, count]) => count))
  return <div className="age-distribution" role="img" aria-label={`Phân bố tuổi: ${bins.map(([label, count]) => `${label}: ${count}`).join(', ')}`}>
    <div className="age-histogram">{bins.map(([label, count]) => <div className="age-bin" key={label}><strong>{count || ''}</strong><i><b style={{ height: `${count * 100 / max}%` }} /></i><span>{label}</span></div>)}</div>
    <small>{unknown > 0 ? `${unknown} thành viên chưa có ngày sinh` : 'Tất cả thành viên đều có dữ liệu tuổi'}</small>
  </div>
}

export function FamilyAnalytics({ data, subject, onOpenCalendar }: { data: FamilyData; subject?: Person; onOpenCalendar?: () => void }) {
  const [scope, setScope] = useState<AnalyticsScope>('all')
  const result = useMemo(() => calculateFamilyAnalytics(data, subject?.id, scope), [data, scope, subject?.id])
  const now = useMemo(() => new Date(), []); const monthEvents = useMemo(() => getFamilyEventsForMonth(data.persons, now.getFullYear(), now.getMonth()), [data.persons, now])
  const upcoming7 = useMemo(() => getUpcomingFamilyEvents(data.persons, 7), [data.persons]); const upcoming30 = useMemo(() => getUpcomingFamilyEvents(data.persons, 30), [data.persons])
  return <section className="analytics-page"><header><div><span className="eyebrow">Family analytics</span><h2>Bức tranh gia đình</h2><p>Chọn phạm vi để xem dữ liệu gia đình quanh <strong>{subject?.name ?? 'chủ thể chưa xác định'}</strong>.</p></div><div className="analytics-scope">{([['all', 'Tất cả'], ['paternal', 'Họ nội'], ['maternal', 'Họ ngoại'], ['descendant', 'Hậu duệ']] as const).map(([value, label]) => <button className={scope === value ? 'active' : ''} onClick={() => setScope(value)} key={value}>{label}</button>)}</div></header>
    <div className="analytics-kpis"><article><UsersRound /><strong>{result.population.total}</strong><span>Tổng số người</span></article><article><strong>{result.population.living}</strong><span>Còn sống</span></article><article><strong>{result.population.deceased}</strong><span>Đã mất</span></article><article><strong>{result.generations.length}</strong><span>Thế hệ có dữ liệu</span></article></div>
    <div className="analytics-grid"><section className="gender-panel"><span className="section-label">Giới tính</span><h3>Phân bố thành viên</h3><GenderDonut values={result.gender} /></section><section className="age-panel"><span className="section-label">Age distribution</span><h3>Nhóm tuổi</h3><AgeHistogram values={result.age} /></section><section className="analytics-location"><span className="section-label"><MapPin size={14} /> Địa chỉ tự khai</span><h3>Nhóm vị trí gần đúng</h3><BarList values={result.locations} /><small>Nhóm theo phần cuối của địa chỉ; không phải dữ liệu địa lý chính xác.</small></section></div>
    <button className="analytics-calendar" onClick={onOpenCalendar}><span><CakeSlice />{monthEvents.filter((event) => event.type === 'birthday').length}<small>Sinh nhật tháng này</small></span><span><Flower2 />{monthEvents.filter((event) => event.type === 'death_anniversary').length}<small>Ngày giỗ tháng này</small></span><span><strong>{upcoming7.length}</strong><small>Trong 7 ngày</small></span><span><strong>{upcoming30.length}</strong><small>Trong 30 ngày</small></span></button>
  </section>
}
