// subset-font ships no types; this covers the call the CLI makes.
declare module 'subset-font' {
  interface SubsetOptions {
    targetFormat?: 'sfnt' | 'woff' | 'woff2' | 'truetype';
    preserveNameIds?: number[];
    keepFeatures?: string[];
    noLayoutClosure?: boolean;
  }
  export default function subsetFont(
    font: Buffer | Uint8Array,
    text: string,
    options?: SubsetOptions,
  ): Promise<Buffer>;
}
