import type { GroupedConversations } from '../interface'

import dayjs from 'dayjs'

export const GroupedConversationsKeyMap = {
  today: '今天',
  yesterday: '昨天',
  last7Days: '最近7天',
  last30Days: '最近30天',
  other: '其他',
}

export function formatObjectArrayByTime(array: any[], dateKey: string) {
  const today = dayjs()

  // 计算各个时间临界点
  const todayStart = today.startOf('day')
  const yesterdayStart = todayStart.subtract(1, 'day')
  const sevenDaysAgoStart = todayStart.subtract(7, 'day')
  const thirtyDaysAgoStart = todayStart.subtract(30, 'day')
  // 初始化分组对象
  const grouped: GroupedConversations = {
    today: [],
    yesterday: [],
    last7Days: [],
    last30Days: [],
    other: [],
  }

  const groupTime = [
    {
      key: 'today',
      start: todayStart.startOf('day'),
      end: todayStart.endOf('day'),
    },
    {
      key: 'yesterday',
      start: yesterdayStart.startOf('day'),
      end: todayStart.startOf('day'),
    },
    {
      key: 'last7Days',
      start: sevenDaysAgoStart.startOf('day'),
      end: yesterdayStart.startOf('day'),
    },
    {
      key: 'last30Days',
      start: thirtyDaysAgoStart.startOf('day'),
      end: sevenDaysAgoStart.startOf('day'),
    },
  ]

  for (const item of array || []) {
    const createTime = dayjs(item[dateKey])
    let isGrouped = false
    for (const time of groupTime) {
      if (createTime.isAfter(time.start) && createTime.isBefore(time.end)) {
        grouped[time.key as keyof GroupedConversations].push(item)
        isGrouped = true
        break
      }
    }
    if (!isGrouped) {
      grouped.other.push(item)
    }
  }
  return grouped
}
