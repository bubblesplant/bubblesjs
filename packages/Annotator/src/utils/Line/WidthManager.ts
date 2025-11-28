export interface WidthManager {
  width: number
  maxWidth: number
  add: (width: number) => void
  reset: () => void
  isFull: (wordOrLabelWidth: number) => boolean
  isEmpty: () => boolean
  canAdd: (width: number) => boolean
}

export class LineWidthManager implements WidthManager {
  private totalWidth = 0
  private maxLineWidth: number
  private maxLabelWidth: number

  constructor(maxLineWidth: number, maxLabelWidth: number) {
    this.maxLineWidth = maxLineWidth
    this.maxLabelWidth = maxLabelWidth
  }

  get width(): number {
    return this.totalWidth
  }

  get maxWidth(): number {
    return this.maxLineWidth - this.maxLabelWidth
  }

  add(width: number): void {
    this.totalWidth += width
  }

  reset(): void {
    this.totalWidth = 0
  }

  isFull(wordOrLabelWidth = 0): boolean {
    return this.maxWidth < this.totalWidth + wordOrLabelWidth
  }

  canAdd(width: number): boolean {
    return this.totalWidth + width <= this.maxWidth
  }

  isEmpty(): boolean {
    return this.totalWidth === 0
  }
}
