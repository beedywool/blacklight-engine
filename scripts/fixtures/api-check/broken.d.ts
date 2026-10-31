export declare function undocumented(value: number): number;

/** Adds two numbers, but shows no example. */
export declare function noExample(a: number, b: number): number;

/**
 * Reads anything.
 *
 * @example
 * ```ts
 * loose({});
 * ```
 */
export declare function loose(value: any): Record<string, any>;

/** A shape with an undocumented member. */
export interface Shape {
  width: number;
}

/**
 * The default export.
 *
 * @example
 * ```ts
 * import thing from 'broken';
 * ```
 */
declare function thing(): void;
export default thing;

declare function createHidden(): { value: number };
/** The API of a factory that is not exported: its shape stays out of the reference. */
export type Hidden = ReturnType<typeof createHidden>;
