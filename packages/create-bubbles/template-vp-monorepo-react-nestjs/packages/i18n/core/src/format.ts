export type MessageValues = Record<string, string | number>

export function formatMessage(message: string, values?: MessageValues): string {
  if (!values) return message

  return message.replace(/\{(\w+)\}/g, (match, key: string) => {
    return String(values[key] ?? match)
  })
}
