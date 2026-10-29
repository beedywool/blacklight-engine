import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { IdTokenVerifier } from '../src/oidc.ts';
import { Sessions } from '../src/session.ts';

const ISSUER = 'https://id.example.com';

function token(alg: string, key: KeyObject, kid: string, claims: Record<string, unknown>): string {
  const head = Buffer.from(JSON.stringify({ alg, kid })).toString('base64url');
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const data = Buffer.from(`${head}.${body}`);
  const signature =
    alg === 'ES256'
      ? sign('sha256', data, { key, dsaEncoding: 'ieee-p1363' })
      : sign(alg === 'EdDSA' ? null : 'sha256', data, key);
  return `${head}.${body}.${signature.toString('base64url')}`;
}

describe('IdTokenVerifier', () => {
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const ed = generateKeyPairSync('ed25519');
  let jwks = [
    { ...ec.publicKey.export({ format: 'jwk' }), kid: 'ec' },
    { ...ed.publicKey.export({ format: 'jwk' }), kid: 'ed' },
  ];
  const fetched: string[] = [];
  const fakeFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    fetched.push(url);
    const data = url.endsWith('/.well-known/openid-configuration')
      ? { issuer: ISSUER, jwks_uri: `${ISSUER}/jwks` }
      : { keys: jwks };
    return new Response(JSON.stringify(data));
  }) as typeof fetch;
  const claims = () => ({ iss: ISSUER, sub: 's', aud: ['game'], exp: Date.now() / 1000 + 60 });

  it('accepts ES256 and EdDSA signatures and reaches the provider through internalUrl', async () => {
    const verifier = new IdTokenVerifier(
      [{ issuer: ISSUER, audiences: ['game'], internalUrl: 'http://sso:3000' }],
      fakeFetch,
    );
    expect((await verifier.verify(token('ES256', ec.privateKey, 'ec', claims()))).sub).toBe('s');
    expect((await verifier.verify(token('EdDSA', ed.privateKey, 'ed', claims()))).sub).toBe('s');
    expect(fetched).toEqual([
      'http://sso:3000/.well-known/openid-configuration',
      'http://sso:3000/jwks',
    ]);
  });

  it('refuses "none", a key from another provider and tokens not valid yet', async () => {
    const verifier = new IdTokenVerifier([{ issuer: ISSUER, audiences: ['game'] }], fakeFetch);
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims())).toString('base64url')}.`;
    await expect(verifier.verify(none)).rejects.toThrow(/not supported/);
    const stranger = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    await expect(
      verifier.verify(token('ES256', stranger.privateKey, 'ec', claims())),
    ).rejects.toThrow(/signature is invalid/);
    await expect(
      verifier.verify(
        token('ES256', ec.privateKey, 'ec', { ...claims(), nbf: Date.now() / 1000 + 600 }),
      ),
    ).rejects.toThrow(/not valid yet/);
    jwks = [];
    await expect(
      verifier.verify(token('ES256', ec.privateKey, 'rotated', claims())),
    ).rejects.toThrow(/no ES256 key/);
  });
});

describe('Sessions', () => {
  it('signs, checks and expires tokens', () => {
    const sessions = new Sessions('x'.repeat(32));
    const { token: value, expiresAt } = sessions.issue('account-1', 1000);
    expect(sessions.check(value, 2000)).toEqual({ accountId: 'account-1', expiresAt });
    expect(sessions.check(value, expiresAt + 1)).toBeUndefined();
    expect(new Sessions('y'.repeat(32)).check(value, 2000)).toBeUndefined();
    expect(sessions.check(`${value}x`, 2000)).toBeUndefined();
  });
});
