# Blacklight module index

The list of modules that `blacklight add` and `blacklight search` know. Each module is one file, `entries/<name>.json`, pointing at an npm package. CI checks every pull request and, on `main`, builds the static API (`v1/index.json`, `v1/modules/<name>.json`) and publishes it. Packages themselves stay on npm: this repository never hosts tarballs.

## Add a module

1. Publish the package on npm under `blacklight-module-<name>` or `@scope/blacklight-module-<name>`, with a `blacklight` manifest in its `package.json` (`blacklight publish` checks it first):

   ```json
   "blacklight": {
     "module": "chat",
     "engine": "^1.0.0",
     "platforms": ["web", "desktop", "android", "ios"],
     "permissions": ["network"]
   }
   ```

2. Open a pull request that adds `entries/<name>.json`:

   ```json
   {
     "name": "chat",
     "package": "blacklight-module-chat",
     "repository": "https://github.com/me/blacklight-module-chat"
   }
   ```

3. CI runs `blacklight-registry validate`: the file name equals `name`, the package exists on npm, its latest version has a valid manifest whose `module` equals `name`, its license is MIT-compatible, and every module it depends on has an entry. Fix what it lists and push again.

New versions of a listed package need no pull request: the next build (on each push to `main` and once a day) reads every version from npm.

## Check locally

```sh
npx -p @blacklight/registry blacklight-registry validate .
npx -p @blacklight/registry blacklight-registry build . --out public
```

`public/` is the folder to serve. Any static host works; games and the CLI only read `v1/index.json` and `v1/modules/<name>.json`.

## Limits

- The index trusts npm for package contents; it checks manifests and licenses, not code.
- `official: true` is set by the maintainers only.
- Removing a module from the index does not unpublish it from npm; projects that installed it keep working.
