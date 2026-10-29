const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Growable little-endian byte writer for session messages. */
export class ByteWriter {
  private buffer = new Uint8Array(256);
  private view = new DataView(this.buffer.buffer);
  length = 0;

  private reserve(bytes: number): void {
    if (this.length + bytes <= this.buffer.length) return;
    let size = this.buffer.length * 2;
    while (size < this.length + bytes) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buffer.subarray(0, this.length));
    this.buffer = next;
    this.view = new DataView(next.buffer);
  }

  u8(value: number): this {
    this.reserve(1);
    this.view.setUint8(this.length, value);
    this.length += 1;
    return this;
  }

  u16(value: number): this {
    this.reserve(2);
    this.view.setUint16(this.length, value, true);
    this.length += 2;
    return this;
  }

  i32(value: number): this {
    this.reserve(4);
    this.view.setInt32(this.length, value, true);
    this.length += 4;
    return this;
  }

  u32(value: number): this {
    this.reserve(4);
    this.view.setUint32(this.length, value >>> 0, true);
    this.length += 4;
    return this;
  }

  bytes(data: Uint8Array): this {
    this.reserve(data.length);
    this.buffer.set(data, this.length);
    this.length += data.length;
    return this;
  }

  /** UTF-8 text with a 32-bit length. */
  text(value: string): this {
    const data = encoder.encode(value);
    this.u32(data.length);
    return this.bytes(data);
  }

  finish(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }
}

/** Reader matching {@link ByteWriter}; throws `RangeError` on truncated data. */
export class ByteReader {
  private readonly view: DataView;
  offset = 0;

  constructor(private readonly data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  get remaining(): number {
    return this.data.length - this.offset;
  }

  private take(bytes: number): number {
    if (this.offset + bytes > this.data.length) throw new RangeError('Truncated message.');
    const at = this.offset;
    this.offset += bytes;
    return at;
  }

  u8(): number {
    return this.view.getUint8(this.take(1));
  }

  u16(): number {
    return this.view.getUint16(this.take(2), true);
  }

  i32(): number {
    return this.view.getInt32(this.take(4), true);
  }

  u32(): number {
    return this.view.getUint32(this.take(4), true);
  }

  bytes(length: number): Uint8Array {
    const at = this.take(length);
    return this.data.slice(at, at + length);
  }

  text(): string {
    const length = this.u32();
    return decoder.decode(this.bytes(length));
  }
}

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
