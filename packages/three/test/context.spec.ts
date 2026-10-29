import { describe, expect, it } from 'vitest';
import type { WebGLRenderer as PixiWebGLRenderer } from 'pixi.js';
import type { WebGLRenderer as ThreeRenderer, WebGLRenderTarget } from 'three';
import { SharedContext } from '../src/context';

/** Pixi and Three stand-ins recording what the shared context does, in order. */
function fakes(inverted: boolean) {
  const calls: string[] = [];
  const saved = { target: 'texture', clear: 0 };
  const projection = { a: 1, b: 0, c: 0, d: -1, tx: 0, ty: 0 };
  const group = { a: 2, b: 0, c: 0, d: 2, tx: 5, ty: 6 };
  const pixi = {
    gl: {
      VIEWPORT: 1,
      UNPACK_FLIP_Y_WEBGL: 2,
      UNPACK_PREMULTIPLY_ALPHA_WEBGL: 3,
      pixelStorei: (name: number, value: boolean) => calls.push(`gl.pixelStorei ${name} ${value}`),
    },
    renderTarget: {
      renderTarget: { isRoot: true, pixelHeight: 400 },
      viewport: { x: 10, y: 20, width: 300, height: 200 },
      ensureDepthStencil: () => calls.push('pixi.ensureDepthStencil'),
      getBindState: (out: Record<string, unknown>) => Object.assign(out, saved),
      getGpuRenderTarget: () => ({ framebuffer: 'pixi-fbo' }),
      isFrontFaceInverted: () => inverted,
      bind: (state: typeof saved) => calls.push(`pixi.bind ${state.target}`),
    },
    globalUniforms: {
      uniformGroup: { uniforms: { uProjectionMatrix: projection, uWorldTransformMatrix: group } },
    },
    resetState: () => calls.push('pixi.resetState'),
  };
  const flips: boolean[] = [];
  const three = {
    state: { setFlipSided: (flip: boolean) => flips.push(flip) },
    resetState: () => calls.push('three.resetState'),
    setRenderTargetFramebuffer: (target: WebGLRenderTarget, fbo: unknown) =>
      calls.push(`three.framebuffer ${String(fbo)} ${target.viewport.toArray().join(',')}`),
    setRenderTarget: () => calls.push('three.setRenderTarget'),
  };
  const context = new SharedContext(
    pixi as unknown as PixiWebGLRenderer,
    three as unknown as ThreeRenderer,
  );
  return { context, calls, flips, three, projection, group };
}

describe('SharedContext', () => {
  it('draws into the framebuffer Pixi has bound and resets both renderers around it', () => {
    const { context, calls, projection, group } = fakes(false);
    calls.length = 0;
    let seen: unknown;
    context.draw((_three, target) => {
      calls.push('paint');
      seen = target;
    });
    expect(calls).toEqual([
      'pixi.ensureDepthStencil',
      'three.resetState',
      'three.framebuffer pixi-fbo 10,180,300,200',
      'three.setRenderTarget',
      'paint',
      'three.resetState',
      'pixi.resetState',
      'pixi.bind texture',
    ]);
    expect(seen).toEqual({ projection, group });
    expect(context.draws).toBe(1);
  });

  it('gives the context back to Pixi even when drawing fails', () => {
    const { context, calls } = fakes(false);
    calls.length = 0;
    expect(() =>
      context.draw(() => {
        throw new Error('shader');
      }),
    ).toThrow('shader');
    expect(calls.slice(-3)).toEqual(['three.resetState', 'pixi.resetState', 'pixi.bind texture']);
  });

  it('turns the front face around when Pixi draws into a flipped render texture', () => {
    const flipped = fakes(true);
    flipped.context.draw((three) => three.state.setFlipSided(false));
    expect(flipped.flips).toEqual([true]);
    const upright = fakes(false);
    upright.context.draw((three) => three.state.setFlipSided(false));
    expect(upright.flips).toEqual([false]);
  });

  it('clears Pixi unpack settings Three cannot start with', () => {
    const { calls } = fakes(false);
    expect(calls).toEqual(['gl.pixelStorei 2 false', 'gl.pixelStorei 3 false']);
  });
});
