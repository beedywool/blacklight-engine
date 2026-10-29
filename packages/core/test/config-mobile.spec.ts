import { describe, expect, it } from 'vitest';
import { ConfigError, resolveConfig } from '../src/config';

const base = {
  name: 'Test Game',
  id: 'com.example.test',
  version: '1.0.0',
  entry: 'title',
  resolution: { width: 1920, height: 1080 },
};

describe('mobile config', () => {
  it('keeps valid mobile options', () => {
    const mobile = {
      orientation: 'portrait',
      statusBar: 'visible',
      keepAwake: false,
      playGamesAppId: '123456789012',
      gameCenter: true,
    } as const;
    expect(resolveConfig({ ...base, mobile }).mobile).toEqual(mobile);
    expect(resolveConfig(base).mobile).toBeUndefined();
  });

  it('reports each invalid mobile field with a fix', () => {
    try {
      resolveConfig({
        ...base,
        mobile: {
          orientation: 'sideways',
          statusBar: true,
          keepAwake: 'yes',
          playGamesAppId: 'my-game',
          gameCenter: 1,
        },
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const issues = (error as ConfigError).issues.join('\n');
      expect(issues).toMatch(/mobile\.orientation.*"landscape", "portrait" or "any"/);
      expect(issues).toMatch(/mobile\.statusBar/);
      expect(issues).toMatch(/mobile\.keepAwake/);
      expect(issues).toMatch(/mobile\.playGamesAppId.*Play Console/);
      expect(issues).toMatch(/mobile\.gameCenter/);
    }
    expect(() => resolveConfig({ ...base, mobile: 'landscape' })).toThrow(
      /`mobile` must be an object/,
    );
  });
});
