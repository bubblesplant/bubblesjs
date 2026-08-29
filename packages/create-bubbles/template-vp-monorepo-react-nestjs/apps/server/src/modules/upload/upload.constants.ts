export const UPLOAD_PART_SIZE = 10 * 1024 * 1024
export const UPLOAD_MAX_PARTS = 10_000
export const UPLOAD_MAX_FILE_SIZE = 90 * 1024 * 1024 * 1024

export function calculateTotalParts(fileSize: number): number {
  return Math.ceil(fileSize / UPLOAD_PART_SIZE)
}

export function calculateExpectedPartSize(
  fileSize: number,
  totalParts: number,
  partNumber: number,
): number {
  if (partNumber < 1 || partNumber > totalParts) {
    throw new RangeError('partNumber is outside the upload range')
  }

  if (partNumber < totalParts) {
    return UPLOAD_PART_SIZE
  }

  return fileSize - (totalParts - 1) * UPLOAD_PART_SIZE
}
