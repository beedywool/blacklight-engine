# Deploy the module registry

The module registry is a set of static JSON files that `blacklight add` and `blacklight search` read. `packages/registry` (`@blacklight/registry`) holds the validator and the generator, `blacklight-registry`; the index itself is a Git repository with one `entries/<name>.json` file per module, and `packages/registry/index/` is the official copy and the template for it. The generator asks npm (or local package folders) for every listed package, checks the manifests and writes the API. Package tarballs stay on npm or on the engine's GitHub releases: the registry host serves JSON only, has no server code and no database. What the files contain and how a module author publishes is in [Module registry](/guide/modules-registry); this page covers building and hosting the index.

## What gets served

```
public/
  v1/
    index.json              every module, sorted by name, with generatedAt
    modules/
      sqlite.json           one module with the manifest of each published version
      http.json
      ...
```

The CLI requests two URLs, relative to the registry base URL:

| Request                             | Sent by                                        | 404 means                                                              |
| ----------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `GET <base>/v1/modules/<name>.json` | `blacklight add <name>`                        | no such module; the CLI then reads `index.json` to suggest close names |
| `GET <base>/v1/index.json`          | `blacklight search`, and `add` for suggestions | not a Blacklight registry                                              |

The base URL is, in order: the `--registry <url>` option of `add`, `search` or `publish`, then the `BLACKLIGHT_REGISTRY` environment variable, then the default `https://beedywool.github.io/blacklight-engine/registry` (`DEFAULT_REGISTRY` in `packages/cli/src/commands/registry.ts`), the official registry described below. Trailing slashes are removed. The base is the folder that holds `v1/`, so a registry under a path works (`https://example.com/modules`).

## The official registry

The engine's own index, `packages/registry/index/`, is built and deployed to GitHub Pages by `.github/workflows/pages.yml`, together with the docs site, after every release:

| URL                                                                             | Content                      |
| ------------------------------------------------------------------------------- | ---------------------------- |
| `https://beedywool.github.io/blacklight-engine/registry/v1/index.json`          | every official module        |
| `https://beedywool.github.io/blacklight-engine/registry/v1/modules/<name>.json` | one module with its versions |

The workflow builds it from the checkout of the release tag, not from npm, and points each official module at the release's tarball:

```sh
node packages/registry/dist/cli.js build packages/registry/index --out site/registry \
  --local packages/modules \
  --release-url https://github.com/beedywool/blacklight-engine/releases/download/v1.2.0
```

`--release-url <folder>` adds `tarball` to the `@blacklight/module-*` entries (`<folder>/blacklight-module-sqlite-1.2.0.tgz`), and `blacklight add` installs that URL. The registry lives under `registry/` of the same Pages site as the docs (at the root): GitHub Pages serves one site per repository and each deployment replaces it, so `pages.yml` builds both into one artifact and deploys them together. It starts when the Release workflow succeeds on a tag push, and runs on `main`, since the `github-pages` environment accepts deployments from `main` only (a job of the release runs on the tag and is refused). To deploy a release again, or after a manual release:

```sh
gh workflow run pages.yml --ref main -f tag=v1.2.0
```

GitHub Pages must be enabled with "GitHub Actions" as the source (repository Settings > Pages). When the registry moves to a custom domain, [Deploy the docs](/guide/deploy-docs#github-pages) lists the steps; `DEFAULT_REGISTRY` changes with them. When the host has no registry (`index.json` answers 404), `blacklight add` falls back to its built-in list of official modules.

Each release replaces the index: `versions` lists the release's version only, since `--local` reads one version per package. Games on an older release are not affected: `blacklight add` installs official modules from the game's own release, whatever the registry's `version` says.

## Build

From the engine repository, build the tool and run it on the index folder:

```sh
pnpm install
pnpm --filter @blacklight/registry build
node packages/registry/dist/cli.js validate packages/registry/index
node packages/registry/dist/cli.js build packages/registry/index --out public
```

`validate` prints every problem and exits with code 1, or prints `The registry index is valid.`. `build` runs the same checks, writes nothing when one fails, and otherwise prints `Wrote <n> modules to <out>/v1/.`. The first positional argument is the index repository (the folder that contains `entries/`, default `.`); `--out` is required for `build`.

Both commands read packages from the npm registry (`https://registry.npmjs.org`). To build from package folders instead, for a preview or a test before anything is published, pass `--local` with a package folder or a folder of package folders; the option can be repeated:

```sh
node packages/registry/dist/cli.js build packages/registry/index --out public --local packages/modules
```

With `--local`, each package contributes only the version in its `package.json`, so `versions` in `v1/modules/<name>.json` has one entry.

In the index repository itself (outside the engine checkout), the template workflow runs the published package instead:

```sh
npx --yes -p @blacklight/registry@1 blacklight-registry validate .
npx --yes -p @blacklight/registry@1 blacklight-registry build . --out public
```

## Host it

### GitHub Pages (the template)

`packages/registry/index/.github/workflows/validate.yml` is the CI of the index repository. Copy the content of `packages/registry/index/` to the root of a new repository and enable GitHub Pages with "GitHub Actions" as the source. The workflow then:

- on every pull request, runs `blacklight-registry validate .`;
- on each push to `main`, once a day (`17 4 * * *`, UTC) and on manual dispatch, validates, runs `blacklight-registry build . --out public` and deploys `public/` with `actions/deploy-pages`.

The daily run is what picks up new versions of listed packages: authors publish to npm, and the next build adds the version to `versions` and moves `version` to the new `latest` tag. To deploy elsewhere, replace the `deploy` job: the artifact is the `public/` folder.

### Any static host

Copy `public/` to the web root of the host. A minimal nginx site:

```nginx
server {
  listen 443 ssl;
  http2 on;
  server_name modules.example.com;
  ssl_certificate     /etc/letsencrypt/live/modules.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/modules.example.com/privkey.pem;

  root /var/www/blacklight-registry;
  location /v1/ {
    default_type application/json;
    add_header Cache-Control "public, max-age=300";
    add_header Access-Control-Allow-Origin "*";
    try_files $uri =404;
  }
}
```

The same with Caddy:

```
modules.example.com {
  root * /var/www/blacklight-registry
  header /v1/* Cache-Control "public, max-age=300"
  header /v1/* Access-Control-Allow-Origin "*"
  file_server
}
```

Two rules matter for the CLI:

- A missing file must answer a real 404. `blacklight add` reads 404 as "no such module" and suggests names; any other error status or a network error is treated as "registry unreachable": `add` then installs an official module (`http`, `sqlite`, `cloud-save`, `accounts-oidc`, `achievements`, `telemetry`) from its built-in list without the engine check, and fails for any other name. A host that answers missing paths with an HTML page and status 200 (a single-page fallback) makes the CLI fail on invalid JSON.
- The CLI parses the body as JSON whatever the `Content-Type`, but browsers and tools expect `application/json`; set it when the host does not infer it from `.json`.

### Cache headers

The files change only when the index is rebuilt (each merge to `main` and once a day). A short cache, `public, max-age=300`, keeps a new module or version visible within minutes of the deploy. A long cache delays `blacklight add` from seeing a new `latest` version and a new entry by that long; do not mark the files `immutable`, their names do not change between builds. GitHub Pages sets `max-age=600` and does not let you change it.

`Access-Control-Allow-Origin: *` is not needed by the CLI (it runs in Node); add it when a web page, such as a module list in the docs, fetches the index from the browser.

## Point the CLI at it

```sh
export BLACKLIGHT_REGISTRY=https://modules.example.com
blacklight search
blacklight add chat
blacklight add chat --registry https://staging-modules.example.com   # one command only
```

Check a deployment by hand:

```sh
curl -sI https://modules.example.com/v1/index.json
curl -s https://modules.example.com/v1/modules/sqlite.json
curl -s -o /dev/null -w '%{http_code}\n' https://modules.example.com/v1/modules/does-not-exist.json   # 404
```

## Adding a module

Listing a module is a pull request on the index repository; the maintainer of the registry reviews and merges it, and the next build publishes it.

1. The author publishes the package on npm as `blacklight-module-<name>` or `@scope/blacklight-module-<name>` with a valid `blacklight` manifest and an MIT-compatible license. `blacklight publish` checks the package, runs `npm publish --access public`, and prints the entry file to submit.
2. The author opens a pull request that adds `entries/<name>.json`:

   ```json
   {
     "name": "chat",
     "package": "blacklight-module-chat",
     "repository": "https://github.com/me/blacklight-module-chat"
   }
   ```

3. CI runs `blacklight-registry validate .`. It refuses the entry when the file name and `name` differ, when `package` does not carry the module name, when a field other than `name`, `package`, `repository` and `official` is present, when the package is not on npm, when its `latest` version has an invalid manifest or license or declares another module name, when the same package is already listed, or when a module in its `dependencies` has no entry.
4. Review what CI cannot check: the repository and the code behind the declared permissions. `official: true` is set by the maintainers only, for modules maintained with the engine; refuse it in outside pull requests.
5. Merge. The `deploy` job builds and publishes the index; within the cache lifetime, `blacklight search` lists the module.

New versions need no pull request. Removing a module is a pull request that deletes its entry; the package stays on npm and projects that installed it keep working.

## Limits

- `@blacklight/registry` is not published on npm (engine packages are GitHub release assets), so the template workflow's `npx -p @blacklight/registry@1` step fails; replace it with the release tarball (`npx --yes -p https://github.com/beedywool/blacklight-engine/releases/download/v1.2.0/blacklight-registry-1.2.0.tgz blacklight-registry validate .`) or run the tool from the engine checkout as shown in [Build](#build). Validating the official index against npm fails for the same reason; `--local packages/modules` builds it from the checkout, as `pages.yml` does.
- The registry is rebuilt on a schedule, not on npm events: a new version appears after the next build (at most a day with the template workflow, plus the cache lifetime).
- The build reads every listed package from npm one after another; a large index takes as long as that many requests, and an npm outage fails the build (the previous deployment stays online).
- The index checks names, manifests and licenses, not code, and does not mirror tarballs: a package removed from npm cannot be installed, whatever the index says.
- There is no search endpoint or server-side filtering: `blacklight search` downloads `v1/index.json` and filters it locally.
- The API is versioned by its path (`v1/`); there is no other version yet.
