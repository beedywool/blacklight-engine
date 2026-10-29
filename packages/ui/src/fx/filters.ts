import { BlurFilter, Filter, GlProgram, UniformGroup, defaultFilterVert } from 'pixi.js';

/** Names of the built-in effects of the FX layer. */
export type FxName = 'glitch' | 'halftone' | 'blur' | 'chromatic' | 'distort';

/** A filter whose look is driven by one `strength` value (0 = no effect, 1 = full). */
export interface FxFilter extends Filter {
  /** 0–1 (more to exaggerate). */
  strength: number;
  /** Seconds, advanced by the FX layer every frame for animated effects. */
  time: number;
}

const HEADER = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uStrength;
uniform float uTime;
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
vec4 sampleAt(vec2 uv) { return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw)); }
`;

/** Shader sources of the built-in effects (GLSL ES 3.0 fragment bodies, Pixi filter conventions). */
export const FX_SHADERS: Record<Exclude<FxName, 'blur'>, string> = {
  // Horizontal bands jump sideways a few times per second, with a red/blue split.
  glitch: `${HEADER}
void main() {
  vec2 uv = vTextureCoord;
  vec2 px = uv * uInputSize.xy;
  float t = floor(uTime * 14.0);
  float band = floor(px.y / 22.0);
  float r = rand(vec2(band, t));
  if (r > 1.0 - 0.32 * uStrength) uv.x += (rand(vec2(t, band)) - 0.5) * 0.14 * uStrength;
  float split = 7.0 * uStrength * uInputSize.z;
  vec4 c = sampleAt(uv);
  finalColor = vec4(sampleAt(uv + vec2(split, 0.0)).r, c.g, sampleAt(uv - vec2(split, 0.0)).b, c.a);
}`,
  // Comic-print dots: each cell shows a dot sized by the darkness of the image there.
  halftone: `${HEADER}
void main() {
  vec2 px = vTextureCoord * uInputSize.xy;
  float size = 10.0;
  mat2 rot = mat2(0.7071, -0.7071, 0.7071, 0.7071);
  vec2 q = rot * px;
  vec2 cell = (floor(q / size) + 0.5) * size;
  // WebGL 1 (GLSL ES 1.0) has no transpose(): the inverse rotation is written out.
  vec2 center = mat2(0.7071, 0.7071, -0.7071, 0.7071) * cell;
  vec4 c = sampleAt(center * uInputSize.zw);
  vec4 original = sampleAt(vTextureCoord);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float radius = (1.0 - lum) * 0.75 + 0.08;
  float d = length(q - cell) / size;
  float inside = 1.0 - smoothstep(radius - 0.06, radius + 0.06, d);
  vec3 ink = c.rgb * 0.18;
  vec3 paper = mix(c.rgb, vec3(1.0) * c.a, 0.35);
  vec3 dots = mix(paper, ink, inside);
  finalColor = vec4(mix(original.rgb, dots, clamp(uStrength, 0.0, 1.0)), original.a);
}`,
  // Red and blue pushed apart from the center, more toward the edges.
  chromatic: `${HEADER}
void main() {
  vec2 uv = vTextureCoord;
  vec2 size = uInputClamp.zw;
  vec2 dir = (uv / size - 0.5);
  vec2 offset = dir * 0.02 * uStrength * size;
  vec4 c = sampleAt(uv);
  finalColor = vec4(sampleAt(uv + offset).r, c.g, sampleAt(uv - offset).b, c.a);
}`,
  // Waves through the image (scene transitions, dream sequences).
  distort: `${HEADER}
void main() {
  vec2 uv = vTextureCoord;
  vec2 size = uInputClamp.zw;
  vec2 p = uv / size;
  float s = uStrength;
  p.x += sin(p.y * 28.0 + uTime * 5.0) * 0.025 * s;
  p.y += cos(p.x * 22.0 + uTime * 4.0) * 0.02 * s;
  p += (p - 0.5) * 0.12 * s * s;
  finalColor = sampleAt(p * size);
}`,
};

class ShaderFx extends Filter implements FxFilter {
  constructor(fragment: string, name: string) {
    super({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment, name: `bl-fx-${name}` }),
      resources: {
        fxUniforms: new UniformGroup({
          uStrength: { value: 1, type: 'f32' },
          uTime: { value: 0, type: 'f32' },
        }),
      },
    });
  }

  private get uniforms(): { uStrength: number; uTime: number } {
    return (
      this.resources.fxUniforms as UniformGroup<{
        uStrength: { value: number; type: 'f32' };
        uTime: { value: number; type: 'f32' };
      }>
    ).uniforms;
  }

  get strength(): number {
    return this.uniforms.uStrength;
  }
  set strength(value: number) {
    this.uniforms.uStrength = value;
  }
  get time(): number {
    return this.uniforms.uTime;
  }
  set time(value: number) {
    this.uniforms.uTime = value;
  }
}

const BLUR_MAX = 12;

class BlurFx extends BlurFilter implements FxFilter {
  time = 0;
  private level = 1;
  constructor() {
    super({ strength: BLUR_MAX, quality: 4 });
    this.strength = 1;
  }
  // `strength` is 0–1 like the other effects; Pixi's blur strength (pixels) follows it.
  override get strength(): number {
    return this.level;
  }
  override set strength(value: number) {
    this.level = value;
    super.strength = Math.max(0, value * BLUR_MAX);
    this.enabled = value > 0.001;
  }
}

/**
 * Creates a built-in effect filter. Effects run on WebGL; with the WebGPU renderer they are
 * skipped (see the FX layer limits).
 *
 * @example
 * ```ts
 * const glitch = createFxFilter('glitch');
 * glitch.strength = 0.5;
 * ```
 */
export function createFxFilter(name: FxName): FxFilter {
  if (name === 'blur') return new BlurFx();
  const source = FX_SHADERS[name];
  if (!source) {
    throw new Error(
      `Unknown FX "${name}". Built-in effects: glitch, halftone, blur, chromatic, distort; or pass your own Pixi Filter.`,
    );
  }
  return new ShaderFx(source, name);
}
