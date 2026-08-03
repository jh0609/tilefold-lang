import type { ExecutionTraceEvent } from "./executionApi";

const DEFAULT_CHUNK_SIZE = 256;

export class TraceStore {
  readonly chunkSize: number;
  private chunks: ExecutionTraceEvent[][] = [];
  private eventCount = 0;

  constructor(chunkSize = DEFAULT_CHUNK_SIZE) {
    this.chunkSize = chunkSize;
  }

  get length() {
    return this.eventCount;
  }

  appendBatch(events: readonly ExecutionTraceEvent[]) {
    if (events.length === 0) return;
    let offset = 0;
    while (offset < events.length) {
      let chunk = this.chunks[this.chunks.length - 1];
      if (!chunk || chunk.length >= this.chunkSize) {
        chunk = [];
        this.chunks.push(chunk);
      }
      const available = this.chunkSize - chunk.length;
      const slice = events.slice(offset, offset + available);
      chunk.push(...slice);
      this.eventCount += slice.length;
      offset += slice.length;
    }
  }

  get(index: number): ExecutionTraceEvent | undefined {
    if (!Number.isInteger(index) || index < 0 || index >= this.eventCount) {
      return undefined;
    }
    const chunkIndex = Math.floor(index / this.chunkSize);
    const eventIndex = index % this.chunkSize;
    return this.chunks[chunkIndex]?.[eventIndex];
  }

  getRange(start: number, end: number): ExecutionTraceEvent[] {
    const normalizedStart = Math.max(0, Math.floor(start));
    const normalizedEnd = Math.min(this.eventCount, Math.max(normalizedStart, Math.floor(end)));
    const range: ExecutionTraceEvent[] = [];
    for (let index = normalizedStart; index < normalizedEnd; index += 1) {
      const event = this.get(index);
      if (event) range.push(event);
    }
    return range;
  }

  clear() {
    this.chunks = [];
    this.eventCount = 0;
  }

  toArray(): ExecutionTraceEvent[] {
    return this.getRange(0, this.eventCount);
  }

  chunkIdentity(index: number): readonly ExecutionTraceEvent[] | undefined {
    return this.chunks[index];
  }
}
