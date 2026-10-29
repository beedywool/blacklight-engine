// Generates the CC0 test models of templates/2d-with-3d/models (run with `pnpm --filter @blacklight/three models`):
// - hero.glb: a skinned robot of about 10 000 triangles with "idle", "walk" and "wave" clips;
// - hero-draco.glb: the same, Draco-compressed (KHR_draco_mesh_compression);
// - crate.glb: a box whose texture is KTX2 / Basis (KHR_texture_basisu).
// Everything is built from code: no third-party model or texture.
import { mkdirSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';
import {
  ALL_EXTENSIONS,
  KHRDracoMeshCompression,
  KHRTextureBasisu,
} from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import { encodeToKTX2 } from 'ktx2-encoder';

const out = new URL('../../../templates/2d-with-3d/models/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

// GLTFExporter reads its output blobs with FileReader, which Node does not have.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

// Skeleton: rest positions in model space (meters, feet at y = 0, facing +z).
const BONES = [
  ['hips', null, [0, 0.95, 0]],
  ['spine', 'hips', [0, 1.15, 0]],
  ['chest', 'spine', [0, 1.38, 0]],
  ['head', 'chest', [0, 1.58, 0]],
  ['upperArmL', 'chest', [0.25, 1.48, 0]],
  ['forearmL', 'upperArmL', [0.27, 1.17, 0]],
  ['upperArmR', 'chest', [-0.25, 1.48, 0]],
  ['forearmR', 'upperArmR', [-0.27, 1.17, 0]],
  ['thighL', 'hips', [0.11, 0.92, 0]],
  ['shinL', 'thighL', [0.11, 0.5, 0]],
  ['thighR', 'hips', [-0.11, 0.92, 0]],
  ['shinR', 'thighR', [-0.11, 0.5, 0]],
];
const index = Object.fromEntries(BONES.map(([name], i) => [name, i]));

function skeleton() {
  const bones = BONES.map(([name]) => Object.assign(new THREE.Bone(), { name }));
  BONES.forEach(([, parent, at], i) => {
    const bone = bones[i];
    if (parent) {
      const p = BONES[index[parent]][2];
      bone.position.set(at[0] - p[0], at[1] - p[1], at[2] - p[2]);
      bones[index[parent]].add(bone);
    } else {
      bone.position.set(...at);
    }
  });
  return bones;
}

/** Paints a geometry, skins it (weights from its rest position) and returns it ready to merge. */
function part(geometry, color, weights) {
  const g = geometry.index ? geometry : geometry;
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const c = new THREE.Color(color);
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    colors.set([c.r, c.g, c.b], i * 3);
    p.fromBufferAttribute(g.getAttribute('position'), i);
    const list = weights(p);
    list.forEach(([bone, w], k) => {
      skinIndex[i * 4 + k] = index[bone];
      skinWeight[i * 4 + k] = w;
    });
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  return g;
}

/** A cylinder from `top` to `bottom`, blending into `next` over the last fifth near `bottom`. */
function limb(top, bottom, radius, radial, rings, color, bone, next, prev) {
  const a = new THREE.Vector3(...top);
  const b = new THREE.Vector3(...bottom);
  const length = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(radius, radius * 0.9, length, radial, rings, false);
  const direction = a.clone().sub(b).normalize();
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction),
  );
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return part(g, color, (p) => {
    const t = p.clone().sub(a).dot(b.clone().sub(a)) / (length * length);
    if (next && t > 0.8) {
      const w = Math.min(1, (t - 0.8) / 0.4);
      return [
        [bone, 1 - w],
        [next, w],
      ];
    }
    if (prev && t < 0.15) {
      const w = (0.15 - t) / 0.3;
      return [
        [bone, 1 - w],
        [prev, w],
      ];
    }
    return [[bone, 1]];
  });
}

function robotGeometry() {
  const parts = [];
  // Torso: hips, spine and chest share it, blended by height.
  const torso = new THREE.CylinderGeometry(0.21, 0.16, 0.62, 32, 20);
  torso.translate(0, 1.2, 0);
  parts.push(
    part(torso, 0xd8343a, (p) => {
      if (p.y < 1.02) return [['hips', 1]];
      if (p.y < 1.2)
        return [
          ['hips', (1.2 - p.y) / 0.18],
          ['spine', (p.y - 1.02) / 0.18],
        ];
      if (p.y < 1.36)
        return [
          ['spine', (1.36 - p.y) / 0.16],
          ['chest', (p.y - 1.2) / 0.16],
        ];
      return [['chest', 1]];
    }),
  );
  const pelvis = new THREE.SphereGeometry(0.17, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  pelvis.scale(1, 0.5, 0.9);
  pelvis.translate(0, 0.9, 0);
  parts.push(part(pelvis, 0x2b2f3a, () => [['hips', 1]]));
  const head = new THREE.SphereGeometry(0.15, 36, 28);
  head.translate(0, 1.7, 0);
  parts.push(part(head, 0xf2f2f2, () => [['head', 1]]));
  const visor = new THREE.BoxGeometry(0.2, 0.06, 0.08, 4, 2, 2);
  visor.translate(0, 1.71, 0.12);
  parts.push(part(visor, 0x1fb6c9, () => [['head', 1]]));
  for (const [side, sx] of [
    ['L', 1],
    ['R', -1],
  ]) {
    parts.push(
      limb(
        [0.25 * sx, 1.5, 0],
        [0.27 * sx, 1.17, 0],
        0.065,
        24,
        12,
        0x3a3f4d,
        `upperArm${side}`,
        `forearm${side}`,
      ),
      limb(
        [0.27 * sx, 1.17, 0],
        [0.29 * sx, 0.86, 0],
        0.055,
        24,
        12,
        0x50566a,
        `forearm${side}`,
        null,
        `upperArm${side}`,
      ),
      limb(
        [0.11 * sx, 0.94, 0],
        [0.11 * sx, 0.5, 0],
        0.09,
        24,
        16,
        0x2b2f3a,
        `thigh${side}`,
        `shin${side}`,
      ),
      limb(
        [0.11 * sx, 0.5, 0],
        [0.11 * sx, 0.08, 0],
        0.075,
        24,
        16,
        0x3a3f4d,
        `shin${side}`,
        null,
        `thigh${side}`,
      ),
    );
    const hand = new THREE.SphereGeometry(0.06, 12, 10);
    hand.translate(0.29 * sx, 0.83, 0);
    parts.push(part(hand, 0xf2f2f2, () => [[`forearm${side}`, 1]]));
    const foot = new THREE.BoxGeometry(0.12, 0.08, 0.24, 2, 2, 3);
    foot.translate(0.11 * sx, 0.04, 0.05);
    parts.push(part(foot, 0xd8343a, () => [[`shin${side}`, 1]]));
  }
  for (const g of parts) g.deleteAttribute('uv');
  return mergeGeometries(parts.map((g) => (g.index ? g : g)));
}

const q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray();

/** A looping clip from per-bone Euler keys: { bone: [[x, y, z], …] } sampled at `times`. */
function clip(name, times, rotations, positions = {}) {
  const tracks = [];
  for (const [bone, keys] of Object.entries(rotations))
    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        `${bone}.quaternion`,
        times,
        keys.flatMap((k) => q(...k)),
      ),
    );
  for (const [bone, keys] of Object.entries(positions))
    tracks.push(new THREE.VectorKeyframeTrack(`${bone}.position`, times, keys.flat()));
  return new THREE.AnimationClip(name, times.at(-1), tracks);
}

function clips() {
  const T = [0, 0.25, 0.5, 0.75, 1];
  const swing = (a) => [
    [a, 0, 0],
    [0, 0, 0],
    [-a, 0, 0],
    [0, 0, 0],
    [a, 0, 0],
  ];
  const walk = clip(
    'walk',
    T,
    {
      thighL: swing(-0.55),
      thighR: swing(0.55),
      shinL: [
        [0.1, 0, 0],
        [0.2, 0, 0],
        [0.7, 0, 0],
        [0.3, 0, 0],
        [0.1, 0, 0],
      ],
      shinR: [
        [0.7, 0, 0],
        [0.3, 0, 0],
        [0.1, 0, 0],
        [0.2, 0, 0],
        [0.7, 0, 0],
      ],
      upperArmL: swing(0.45),
      upperArmR: swing(-0.45),
      forearmL: [
        [-0.3, 0, 0],
        [-0.2, 0, 0],
        [-0.4, 0, 0],
        [-0.2, 0, 0],
        [-0.3, 0, 0],
      ],
      forearmR: [
        [-0.4, 0, 0],
        [-0.2, 0, 0],
        [-0.3, 0, 0],
        [-0.2, 0, 0],
        [-0.4, 0, 0],
      ],
      chest: [
        [0, 0.12, 0],
        [0, 0, 0],
        [0, -0.12, 0],
        [0, 0, 0],
        [0, 0.12, 0],
      ],
    },
    {
      hips: [
        [0, 0.95, 0],
        [0, 0.91, 0],
        [0, 0.95, 0],
        [0, 0.91, 0],
        [0, 0.95, 0],
      ],
    },
  );
  const I = [0, 1, 2];
  const idle = clip('idle', I, {
    chest: [
      [0, 0, 0],
      [0.05, 0, 0],
      [0, 0, 0],
    ],
    head: [
      [0, -0.15, 0],
      [0, 0.15, 0],
      [0, -0.15, 0],
    ],
    upperArmL: [
      [0, 0, 0.06],
      [0, 0, 0.12],
      [0, 0, 0.06],
    ],
    upperArmR: [
      [0, 0, -0.06],
      [0, 0, -0.12],
      [0, 0, -0.06],
    ],
  });
  const W = [0, 0.3, 0.55, 0.8, 1.05, 1.3, 1.6];
  const wave = clip('wave', W, {
    upperArmR: [
      [0, 0, 0],
      [0, 0, -2.6],
      [0, 0, -2.6],
      [0, 0, -2.6],
      [0, 0, -2.6],
      [0, 0, -2.6],
      [0, 0, 0],
    ],
    forearmR: [
      [0, 0, 0],
      [0, 0, 0.4],
      [0, 0, -0.4],
      [0, 0, 0.4],
      [0, 0, -0.4],
      [0, 0, 0],
      [0, 0, 0],
    ],
    head: [
      [0, 0, 0],
      [0, -0.3, 0.1],
      [0, -0.3, 0.1],
      [0, -0.3, 0.1],
      [0, -0.3, 0.1],
      [0, -0.3, 0.1],
      [0, 0, 0],
    ],
  });
  return [idle, walk, wave];
}

async function exportGlb(scene, animations) {
  const exporter = new GLTFExporter();
  return new Uint8Array(await exporter.parseAsync(scene, { binary: true, animations }));
}

async function hero() {
  const geometry = robotGeometry();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.55,
    metalness: 0.1,
  });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'robot';
  const bones = skeleton();
  mesh.add(bones[0]);
  const root = new THREE.Group();
  root.name = 'hero';
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  const triangles = geometry.index.count / 3;
  const glb = await exportGlb(root, clips());
  writeFileSync(`${out}hero.glb`, glb);
  console.log(`hero.glb: ${triangles} triangles, ${glb.length} bytes`);
  return glb;
}

async function io() {
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });
}

async function heroDraco(glb) {
  const nodeIO = await io();
  const document = await nodeIO.readBinary(glb);
  document
    .createExtension(KHRDracoMeshCompression)
    .setRequired(true)
    .setEncoderOptions({ method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER });
  const out2 = await nodeIO.writeBinary(document);
  writeFileSync(`${out}hero-draco.glb`, out2);
  console.log(`hero-draco.glb: ${out2.length} bytes`);
}

/** 256² crate texture: planks with a darker frame and a diagonal brace. */
function crateTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const frame = x < 24 || y < 24 || x >= size - 24 || y >= size - 24;
      const brace = Math.abs(x - y) < 16;
      const plank = Math.floor(y / 52) % 2 === 0;
      const grain = ((x * 7 + y * 3) % 23) / 23;
      let [r, g, b] = plank ? [196, 140, 72] : [178, 124, 60];
      if (frame || brace) [r, g, b] = [120, 76, 36];
      const k = 0.9 + grain * 0.1;
      const i = (y * size + x) * 4;
      data.set([r * k, g * k, b * k, 255], i);
    }
  return { data, width: size, height: size };
}

async function crate() {
  const pixels = crateTexture();
  const ktx2 = await encodeToKTX2(new Uint8Array(1), {
    isUASTC: false,
    generateMipmap: true,
    isSetKTX2SRGBTransferFunc: true,
    imageDecoder: async () => pixels,
  });
  const document = new Document();
  document.createExtension(KHRTextureBasisu).setRequired(true);
  const buffer = document.createBuffer();
  const box = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  box.translate(0, 0.4, 0);
  const accessor = (name, array, type) =>
    document.createAccessor(name).setBuffer(buffer).setType(type).setArray(array);
  const primitive = document
    .createPrimitive()
    .setAttribute('POSITION', accessor('position', box.getAttribute('position').array, 'VEC3'))
    .setAttribute('NORMAL', accessor('normal', box.getAttribute('normal').array, 'VEC3'))
    .setAttribute('TEXCOORD_0', accessor('uv', box.getAttribute('uv').array, 'VEC2'))
    .setIndices(accessor('index', new Uint16Array(box.index.array), 'SCALAR'));
  const texture = document.createTexture('crate').setImage(ktx2).setMimeType('image/ktx2');
  const material = document
    .createMaterial('crate')
    .setBaseColorTexture(texture)
    .setRoughnessFactor(0.8)
    .setMetallicFactor(0);
  primitive.setMaterial(material);
  const mesh = document.createMesh('crate').addPrimitive(primitive);
  const node = document.createNode('crate').setMesh(mesh);
  document.createScene('crate').addChild(node);
  const glb = await (await io()).writeBinary(document);
  writeFileSync(`${out}crate.glb`, glb);
  console.log(`crate.glb: ${glb.length} bytes (KTX2 ${ktx2.length} bytes)`);
}

await heroDraco(await hero());
await crate();
