// Signing and notarization (PF-07): optional, turned on by the certificates present in the
// environment. The same plan drives real builds and `blacklight sign --dry-run`.

/** Desktop OS of a build. */
export type DesktopOs = 'win' | 'mac' | 'linux';

/** What signing will do for one OS. */
export interface SigningPlan {
  /** The OS the plan is for. */
  os: DesktopOs;
  /** A certificate is configured: the build is signed. */
  sign: boolean;
  /** macOS: Apple credentials are configured: the build is notarized and stapled. */
  notarize: boolean;
  /** The commands the build runs (secrets masked). */
  steps: string[];
  /** Variables to set to sign (or notarize), when something is missing. */
  missing: string[];
  /** Short status for the CLI. */
  summary: string;
}

const has = (env: NodeJS.ProcessEnv, ...names: string[]) => names.every((name) => !!env[name]);

/**
 * Reads the signing credentials of `os` from the environment:
 *
 * - Windows: `WIN_CSC_LINK` (or `CSC_LINK`), a .pfx file path or base64, and its password
 *   `WIN_CSC_KEY_PASSWORD` (or `CSC_KEY_PASSWORD`).
 * - macOS: `CSC_LINK` + `CSC_KEY_PASSWORD` (a Developer ID Application .p12) or `CSC_NAME` (a
 *   certificate in the keychain); notarization with `APPLE_API_KEY` + `APPLE_API_KEY_ID` +
 *   `APPLE_API_ISSUER`, or `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`.
 * - Linux: AppImage and deb packages are not signed (distributions sign their own repositories).
 *
 * @example
 * ```ts
 * signingPlan('mac', process.env).summary; // "unsigned: set CSC_LINK and CSC_KEY_PASSWORD…"
 * ```
 */
export function signingPlan(
  os: DesktopOs,
  env: NodeJS.ProcessEnv = process.env,
  artifact = '<app>',
): SigningPlan {
  if (os === 'linux') {
    return {
      os,
      sign: false,
      notarize: false,
      steps: [],
      missing: [],
      summary: 'Linux packages are not signed.',
    };
  }
  if (os === 'win') {
    const link = env.WIN_CSC_LINK || env.CSC_LINK;
    const password = env.WIN_CSC_KEY_PASSWORD || env.CSC_KEY_PASSWORD;
    const sign = !!link && !!password;
    return {
      os,
      sign,
      notarize: false,
      steps: sign
        ? [
            `signtool sign /f "${link!.length > 260 ? '<base64 certificate>' : link}" /p ****** /fd sha256 /tr http://timestamp.digicert.com /td sha256 "${artifact}"`,
            `signtool verify /pa "${artifact}"`,
          ]
        : [],
      missing: sign
        ? []
        : ['WIN_CSC_LINK (or CSC_LINK)', 'WIN_CSC_KEY_PASSWORD (or CSC_KEY_PASSWORD)'],
      summary: sign
        ? 'Windows: signed with the configured certificate (SHA-256, RFC 3161 timestamp).'
        : 'Windows: unsigned (set WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD to sign). SmartScreen will warn players.',
    };
  }
  const sign = has(env, 'CSC_LINK', 'CSC_KEY_PASSWORD') || has(env, 'CSC_NAME');
  const apiKey = has(env, 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER');
  const appleId = has(env, 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID');
  const notarize = sign && (apiKey || appleId);
  const identity = env.CSC_NAME
    ? `"${env.CSC_NAME}"`
    : '"Developer ID Application" (from CSC_LINK)';
  const steps = sign
    ? [
        `codesign --sign ${identity} --options runtime --timestamp --entitlements entitlements.mac.plist --deep --force "${artifact}"`,
        ...(notarize
          ? [
              apiKey
                ? `xcrun notarytool submit "${artifact}.zip" --key "${env.APPLE_API_KEY}" --key-id ${env.APPLE_API_KEY_ID} --issuer ****** --wait`
                : `xcrun notarytool submit "${artifact}.zip" --apple-id ${env.APPLE_ID} --team-id ${env.APPLE_TEAM_ID} --password ****** --wait`,
              `xcrun stapler staple "${artifact}"`,
            ]
          : []),
        `codesign --verify --deep --strict "${artifact}"`,
      ]
    : [];
  const missing = sign
    ? notarize
      ? []
      : [
          'APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER (or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID)',
        ]
    : ['CSC_LINK + CSC_KEY_PASSWORD (or CSC_NAME)'];
  return {
    os,
    sign,
    notarize,
    steps,
    missing,
    summary: !sign
      ? 'macOS: unsigned (set CSC_LINK and CSC_KEY_PASSWORD to sign). Gatekeeper will block the app until players allow it.'
      : notarize
        ? 'macOS: signed with the hardened runtime, notarized and stapled.'
        : 'macOS: signed but not notarized (set the APPLE_* variables to notarize).',
  };
}

/** Entitlements of the hardened runtime: Electron needs JIT and unsigned executable memory for V8. */
export const MAC_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
  </dict>
</plist>
`;
