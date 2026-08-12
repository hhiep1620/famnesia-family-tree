import type { SpouseStatus } from '../types/family'

export const SPOUSE_STATUS_LABELS: Record<SpouseStatus, string> = {
  married: 'Đã kết hôn',
  partner: 'Bạn đời',
  separated: 'Ly thân',
  divorced: 'Đã ly hôn',
  widowed: 'Góa',
  unknown: 'Chưa xác định',
}
