export function buildUploadObjectKey(
  ownerId: string,
  uploadSessionId: string,
  now = new Date(),
): string {
  const year = String(now.getUTCFullYear())
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')

  return `users/${ownerId}/${year}/${month}/${uploadSessionId}`
}
