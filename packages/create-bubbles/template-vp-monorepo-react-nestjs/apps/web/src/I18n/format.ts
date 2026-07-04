export function formatMessage(message: string, values?: Record<string, string | number>) {
  if (!values) return message

  return message.replace(/\{(\w+)\}/g, (match, key) => {
    return String(values[key] ?? match)
  })
}
