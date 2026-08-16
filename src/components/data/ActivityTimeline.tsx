import { Clock3, FileUp, Image, Merge, Network, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ActivityEvent } from '../../types/family'

function icon(action: string) {
  if (action.includes('import') || action.includes('restore')) return <FileUp size={15} />
  if (action.includes('photo')) return <Image size={15} />
  if (action.includes('merge')) return <Merge size={15} />
  if (action.includes('relationship')) return <Network size={15} />
  return <UserRound size={15} />
}
export function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  const [filter, setFilter] = useState('all')
  const filtered = useMemo(() => events.filter((event) => filter === 'all' || event.entityType === filter || event.action.includes(filter)), [events, filter])
  return <section className="activity-timeline"><p className="activity-retention-note">Famnesia chỉ lưu 20 hoạt động gần nhất và tự xóa lịch sử cũ.</p><div className="activity-filters"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Tất cả</button><button className={filter === 'person' ? 'active' : ''} onClick={() => setFilter('person')}>Thành viên</button><button className={filter === 'relationship' ? 'active' : ''} onClick={() => setFilter('relationship')}>Quan hệ</button><button className={filter === 'dataset' ? 'active' : ''} onClick={() => setFilter('dataset')}>Import / backup</button></div>{filtered.length ? <div>{filtered.map((event) => <article key={event.id}><span>{icon(event.action)}</span><div><strong>{event.summary}</strong><small>{event.actorName || event.actorEmail} · {event.actorEmail}</small></div><time><Clock3 size={12} />{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(event.timestamp))}</time></article>)}</div> : <div className="quality-empty"><Clock3 /><h3>Chưa có lịch sử hoạt động</h3><p>Các thay đổi mới trong workspace sẽ xuất hiện tại đây.</p></div>}</section>
}
