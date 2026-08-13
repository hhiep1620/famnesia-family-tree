import { CakeSlice, Flower2, MapPin, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { calculateFamilyAnalytics, type AnalyticsScope } from '../../analytics/familyAnalytics'
import { getFamilyEventsForMonth, getUpcomingFamilyEvents } from '../../calendar/familyCalendar'
import type { FamilyData, Person } from '../../types/family'

function BarList({ values }: { values: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...values.map((item) => item.count))
  return <div className="analytics-bars">{values.map((item) => <div key={item.label}><span>{item.label}</span><i><b style={{ width: `${item.count * 100 / max}%` }} /></i><strong>{item.count}</strong></div>)}</div>
}

export function FamilyAnalytics({ data, subject, onOpenCalendar }: { data: FamilyData; subject?: Person; onOpenCalendar?: () => void }) {
  const [scope, setScope] = useState<AnalyticsScope>('all')
  const result = useMemo(() => calculateFamilyAnalytics(data, subject?.id, scope), [data, scope, subject?.id])
  const now = useMemo(() => new Date(), []); const monthEvents = useMemo(() => getFamilyEventsForMonth(data.persons, now.getFullYear(), now.getMonth()), [data.persons, now])
  const upcoming7 = useMemo(() => getUpcomingFamilyEvents(data.persons, 7), [data.persons]); const upcoming30 = useMemo(() => getUpcomingFamilyEvents(data.persons, 30), [data.persons])
  return <section className="analytics-page"><header><div><span className="eyebrow">Family analytics</span><h2>Bức tranh gia đình</h2><p>Phân tích dẫn xuất, tương đối với <strong>{subject?.name ?? 'chưa chọn chủ thể'}</strong>.</p></div><div className="analytics-scope">{([['all', 'Tất cả'], ['paternal', 'Họ nội'], ['maternal', 'Họ ngoại'], ['descendant', 'Hậu duệ']] as const).map(([value, label]) => <button className={scope === value ? 'active' : ''} onClick={() => setScope(value)} key={value}>{label}</button>)}</div></header>
    <div className="analytics-kpis"><article><UsersRound /><strong>{result.population.total}</strong><span>Tổng số người</span></article><article><strong>{result.population.living}</strong><span>Còn sống</span></article><article><strong>{result.population.deceased}</strong><span>Đã mất</span></article><article><strong>{result.generations.length}</strong><span>Thế hệ có dữ liệu</span></article></div>
    <div className="analytics-grid"><section><span className="section-label">Giới tính</span><h3>Phân bố thành viên</h3><BarList values={[{ label: 'Nam', count: result.gender.male }, { label: 'Nữ', count: result.gender.female }, { label: 'Khác', count: result.gender.other }, { label: 'Không rõ', count: result.gender.unknown }]} /></section><section><span className="section-label">Độ tuổi hiện tại</span><h3>Các nhóm tuổi</h3><BarList values={Object.entries(result.age).map(([label, count]) => ({ label, count }))} /></section><section><span className="section-label">Thế hệ</span><h3>Tương đối với chủ thể</h3><BarList values={result.generations.map((item) => ({ label: item.generation > 0 ? `+${item.generation}` : String(item.generation), count: item.count }))} /></section><section><span className="section-label"><MapPin size={12} /> Địa chỉ tự khai</span><h3>Nhóm vị trí gần đúng</h3><BarList values={result.locations} /><small>Nhóm theo phần cuối của địa chỉ; không phải dữ liệu địa lý chính xác.</small></section></div>
    <button className="analytics-calendar" onClick={onOpenCalendar}><span><CakeSlice />{monthEvents.filter((event) => event.type === 'birthday').length}<small>Sinh nhật tháng này</small></span><span><Flower2 />{monthEvents.filter((event) => event.type === 'death_anniversary').length}<small>Ngày giỗ tháng này</small></span><span><strong>{upcoming7.length}</strong><small>Trong 7 ngày</small></span><span><strong>{upcoming30.length}</strong><small>Trong 30 ngày</small></span></button>
  </section>
}
