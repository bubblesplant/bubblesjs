export class TextLine {
  readonly startOffset: number
  readonly endOffset: number
  constructor(startOffset: number, endOffset: number) {
    this.startOffset = startOffset
    this.endOffset = endOffset
  }
}
