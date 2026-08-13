import { CakeSlice, ChevronLeft, ChevronRight, Flower2, Network } from 'lucide-react'
import { useMemo, useState } from 'react'
import { parseIsoDate, todayInFamilyTimezone, toIsoDate } from '../../calendar/dateUtils'
import { getFamilyEventsForMonth, getReminderLabel, getUpcomingFamilyEvents } from '../../calendar/familyCalendar'
import { formatLunarDate } from '../../calendar/lunarCalendar'
import type { FamilyEvent, FamilyEventType, Person } from '../../types/family'

interface Props { persons: Person[]; onOpenPerson: (personId: string) => void; onViewTree?: (personId: string) => void }
type Range = 7 | 30 | 'month' | 'year'

const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const typeLabels: Record<FamilyEventType | 'all', string> = { all: 'Tất cả', birthday: 'Sinh nhật', death_anniversary: 'Ngày giỗ' }

function EventIcon({ type, size = 14 }: { type: FamilyEventType; size?: number }) {
  return type === 'birthday' ? <CakeSlice size={size} /> : <Flower2 size={size} />
}

function getRangeEvents(persons: Person[], range: Range, type: FamilyEventType | 'all', today: Date): FamilyEvent[] {
  const end = range === 'month' ? new Date(today.getFullYear(), today.getMonth() + 1, 0, 12) : range === 'year' ? new Date(today.getFullYear(), 11, 31, 12) : new Date(today.getFullYear(), today.getMonth(), today.getDate() + range, 12)
  return getUpcomingFamilyEvents(persons, Math.max(0, Math.round((end.getTime() - today.getTime()) / 86_400_000)), type, today)
}

export function FamilyCalendar({ persons, onOpenPerson, onViewTree }: Props) {
  const today = useMemo(() => todayInFamilyTimezone(), [])
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1, 12))
  const [type, setType] = useState<FamilyEventType | 'all'>('all')
  const [range, setRange] = useState<Range>('month')
  const events = useMemo(() => getFamilyEventsForMonth(persons, cursor.getFullYear(), cursor.getMonth(), type), [cursor, persons, type])
  const upcoming = useMemo(() => getRangeEvents(persons, range, type, today), [persons, range, today, type])
  const personById = useMemo(() => new Map(persons.map((person) => [person.id, person])), [persons])
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const mondayOffset = (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7
  const cells: Array<number | undefined> = [...Array(mondayOffset).fill(undefined), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)]
  while (cells.length % 7) cells.push(undefined)

  const moveMonth = (delta: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1, 12))
  const dateEvents = (day: number) => events.filter((event) => parseIsoDate(event.date)?.getDate() === day)

  return <section className="calendar-page" aria-label="Lịch gia đình">
    <div className="calendar-toolbar">
      <div><span className="eyebrow">Lịch gia đình</span><h2>{cursor.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}</h2></div>
      <div className="calendar-nav"><button className="icon-button" onClick={() => moveMonth(-1)} aria-label="Tháng trước"><ChevronLeft size={18} /></button><button className="secondary-button" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1, 12))}>Hôm nay</button><button className="icon-button" onClick={() => moveMonth(1)} aria-label="Tháng sau"><ChevronRight size={18} /></button></div>
    </div>
    <div className="calendar-type-filters" aria-label="Lọc loại sự kiện">{Object.entries(typeLabels).map(([value, label]) => <button key={value} className={type === value ? 'active' : ''} onClick={() => setType(value as FamilyEventType | 'all')}>{label}</button>)}</div>
    <div className="calendar-layout">
      <div className="month-calendar">
        <div className="weekday-row">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">{cells.map((day, index) => <div key={`${index}-${day ?? 'blank'}`} className={`calendar-day ${day && today.getFullYear() === cursor.getFullYear() && today.getMonth() === cursor.getMonth() && today.getDate() === day ? 'is-today' : ''} ${!day ? 'is-empty' : ''}`}>
          {day && <><div className="calendar-date-pair"><span className="day-number">{day}</span><small>{formatLunarDate(toIsoDate(new Date(cursor.getFullYear(), cursor.getMonth(), day, 12))).replace(' ÂL', '')}</small></div><div className="day-events">{dateEvents(day).map((event) => { const person = personById.get(event.personId); return <button className={`calendar-event ${event.type}`} key={event.id} onClick={() => onOpenPerson(event.personId)}><EventIcon type={event.type} /><span>{person?.name ?? event.personId}</span></button> })}</div></>}
        </div>)}</div>
      </div>
      <aside className="upcoming-panel"><div className="upcoming-heading"><span className="eyebrow">Nhắc việc · {formatLunarDate(toIsoDate(today), true)}</span><h3>Sự kiện sắp tới</h3></div><div className="range-filters"><button className={range === 7 ? 'active' : ''} onClick={() => setRange(7)}>7 ngày</button><button className={range === 30 ? 'active' : ''} onClick={() => setRange(30)}>30 ngày</button><button className={range === 'month' ? 'active' : ''} onClick={() => setRange('month')}>Tháng này</button><button className={range === 'year' ? 'active' : ''} onClick={() => setRange('year')}>Năm nay</button></div>
        <div className="upcoming-list">{upcoming.length ? upcoming.map((event) => { const person = personById.get(event.personId); return <div className="upcoming-event-row" key={event.id}><button onClick={() => onOpenPerson(event.personId)}><span className={`event-icon ${event.type}`}><EventIcon type={event.type} size={16} /></span><span className="event-copy"><strong>{person?.name ?? event.personId}</strong><small>{event.type === 'birthday' ? `Sinh nhật${event.ageTurning !== undefined ? ` — ${event.ageTurning} tuổi` : ''}` : `Giỗ — ${event.lunarDate?.day}/${event.lunarDate?.month}${event.lunarDate?.leapMonth ? ' nhuận' : ''} Âm lịch`}</small></span><time>{getReminderLabel(event, today)}</time></button>{onViewTree ? <button className="event-tree-link" onClick={() => onViewTree(event.personId)} aria-label={`Xem ${person?.name ?? event.personId} trong cây gia đình`}><Network size={14} /></button> : null}</div> }) : <div className="no-events"><span>Không có sự kiện trong khoảng này.</span></div>}</div>
      </aside>
    </div>
  </section>
}
