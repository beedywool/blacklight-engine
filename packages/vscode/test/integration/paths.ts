/**
 * A path as Windows compares it: VS Code's `Uri.fsPath` writes the drive letter in lower case
 * (`c:\Users\…`) while Node's `os.tmpdir()` gives `C:\Users\…`; both name the same file, and the
 * JavaScript debugger matches drive letters without case. Other platforms keep the path as is.
 */
export function comparablePath(path: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? path.replace(/^[a-z]:/, (drive) => drive.toUpperCase()) : path;
}
