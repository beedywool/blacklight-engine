import { describe, expect, it } from 'vitest';
import { ConfigError, defineConfig, resolveConfig } from '../src/config';

const valid = defineConfig({
  name: 'Test Game',
  id: 'com.example.test',
  version: '1.0.0',
  entry: 'title',
  resolution: { width: 1920, height: 1080 },
});

describe('resolveConfig', () => {
  it('fills defaults', () => {
    expect(resolveConfig(valid)).toEqual({
      ...valid,
      resolution: { width: 1920, height: 1080, mode: 'extend', pixelArt: false },
      tickRate: 60,
      pauseOnBlur: true,
    });
  });

  it('keeps explicit values', () => {
    const resolved = resolveConfig({
      ...valid,
      resolution: { width: 320, height: 180, mode: 'letterbox', pixelArt: true },
      tickRate: 30,
      pauseOnBlur: false,
    });
    expect(resolved.resolution).toEqual({
      width: 320,
      height: 180,
      mode: 'letterbox',
      pixelArt: true,
    });
    expect(resolved.tickRate).toBe(30);
    expect(resolved.pauseOnBlur).toBe(false);
  });

  it('reports every problem at once with a fix', () => {
    try {
      resolveConfig({
        name: '',
        id: 'MyGame',
        version: '1',
        resolution: { width: 0, height: 1080, mode: 'stretch' },
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const { issues } = error as ConfigError;
      expect(issues).toHaveLength(6);
      expect(issues.join('\n')).toMatch(/com\.example\.mygame/);
      expect((error as Error).message).toMatch(/^game\.config\.ts is invalid:/);
    }
  });

  it('rejects a non-object export', () => {
    expect(() => resolveConfig(undefined)).toThrow(/defineConfig/);
  });
});
