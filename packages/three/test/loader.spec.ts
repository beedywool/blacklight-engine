import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AssetStore } from '@blacklight/core';
import { extensionsUsed, parseModel } from '../src/loader';

// three's FileLoader reports progress with the browser's ProgressEvent, which Node lacks.
globalThis.ProgressEvent ??= class extends Event {
  constructor(type: string, init: ProgressEventInit = {}) {
    super(type);
    Object.assign(this, init);
  }
} as unknown as typeof ProgressEvent;

const models = new URL('../../../templates/2d-with-3d/models/', import.meta.url);
const read = (name: string) => {
  const bytes = readFileSync(new URL(name, models));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

/** A one-triangle .gltf whose geometry lives in a separate tri.bin. */
function triangleGltf(): { json: ArrayBuffer; bin: string } {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const json = {
    asset: { version: '2.0' },
    buffers: [{ uri: 'tri.bin', byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
  };
  const bin = `data:application/octet-stream;base64,${Buffer.from(positions.buffer).toString('base64')}`;
  return { json: new TextEncoder().encode(JSON.stringify(json)).buffer as ArrayBuffer, bin };
}

describe('glTF loading', () => {
  it('parses the template robot: skinned, animated, about 10 000 triangles', async () => {
    const model = await parseModel(read('hero.glb'), 'models/hero.glb');
    expect(model.animations.map((clip) => clip.name)).toEqual(['idle', 'walk', 'wave']);
    expect(model.triangles).toBeGreaterThan(9500);
    expect(model.triangles).toBeLessThanOrEqual(10_500);
    expect(model.box.max.y - model.box.min.y).toBeCloseTo(1.85, 1);
    expect(model.sphere.radius).toBeGreaterThan(0.9);
  });

  it('reads the extensions a file needs without parsing it', () => {
    expect(extensionsUsed(read('hero.glb'))).toEqual([]);
    expect(extensionsUsed(read('hero-draco.glb'))).toContain('KHR_draco_mesh_compression');
    expect(extensionsUsed(read('crate.glb'))).toContain('KHR_texture_basisu');
    expect(extensionsUsed(triangleGltf().json)).toEqual([]);
    expect(extensionsUsed(new TextEncoder().encode('not json').buffer as ArrayBuffer)).toEqual([]);
  });

  it('finds the files a .gltf references through the asset manifest', async () => {
    const { json, bin } = triangleGltf();
    const assets = new AssetStore({
      files: { 'models/tri.gltf': '/assets/tri-x1.gltf', 'models/tri.bin': bin },
    });
    const model = await parseModel(json, 'models/tri.gltf', assets);
    expect(model.triangles).toBe(1);
    await expect(parseModel(json, 'models/other/tri.gltf', assets)).rejects.toThrow(
      /references "tri.bin", which is not in the project \(looked for models\/other\/tri.bin\)/,
    );
  });
});
