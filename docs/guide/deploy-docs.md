# Deploy the docs site and playground

The documentation is a VitePress site in `docs/`. `pnpm docs:build` turns it into a folder of static files: HTML pages, hashed JavaScript and CSS bundles, the bundled Google Sans Flex font files, the logo and the local search index. The playground is a page of the same site, so it is part of the same build and the same folder. Nothing runs on the server: any host that serves files over HTTPS works (nginx, Caddy, GitHub Pages, Cloudflare Pages, an S3 bucket behind a CDN).

## Build

From the repository root, with the workspace installed:

```sh
pnpm install
pnpm docs:build
pnpm --filter blacklight-docs preview   # serves the build on http://localhost:4173 to check it
```

The output is `docs/.vitepress/dist/`. Upload the content of that folder, not the folder itself, to the web root. The build fails on a dead internal link, so a build that finishes has no broken links between pages.

By default the site expects to be served at the root of a domain (`https://docs.example.com/`, and `pnpm docs:dev`). To serve it under a path (`https://example.com/engine/`), build with that path in `DOCS_BASE`; `docs/.vitepress/config.ts` passes it to VitePress as `base`, so page links, bundles, fonts, the logo, the search index, the example runner and its assets all carry the prefix:

```sh
DOCS_BASE=/engine/ pnpm docs:build
DOCS_BASE=/engine/ pnpm --filter blacklight-docs preview   # http://localhost:4173/engine/
```

The asset URLs are written at build time and do not follow a move: a build for `/engine/` does not work at the root, and the other way round. `DOCS_BASE=/engine/ pnpm e2e e2e/docs.spec.ts` (with `BLACKLIGHT_DOCS_BUILT=1` to reuse the build) runs the docs checks against such a build.

## The playground

The playground runs the engine in the visitor's browser: the code is bundled into the static output and executes client-side, with no server-side component, no API and no database. It is deployed with the rest of the site by the steps above. What it needs from the host is what any page of a Blacklight Engine web build needs: the JavaScript bundles served with a JavaScript content type, and, when the host sends a Content Security Policy, a policy that allows WebAssembly compilation and workers (see [Headers](#headers)).

## Host requirements

The site is built with `cleanUrls: true`: links point to `/guide/server`, while the file on disk is `guide/server.html`. The host must answer an extensionless path with the matching `.html` file. GitHub Pages, Cloudflare Pages and Netlify do it by default; nginx and Caddy need one line (below). VitePress also writes `404.html`; point the host's not-found page at it.

Do not configure a single-page fallback (every path answered with `index.html`): VitePress pages are separate HTML files, and a fallback hides real 404s.

### nginx

```nginx
server {
  listen 443 ssl;
  http2 on;
  server_name docs.example.com;
  ssl_certificate     /etc/letsencrypt/live/docs.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/docs.example.com/privkey.pem;

  root /var/www/blacklight-docs;
  error_page 404 /404.html;

  location / {
    try_files $uri $uri.html $uri/ =404;
    add_header Cache-Control "no-cache";
  }

  # Hashed file names: a new build writes new names, so these never change.
  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
  }
}
```

### Caddy

```
docs.example.com {
  root * /var/www/blacklight-docs
  try_files {path} {path}.html {path}/
  file_server
  handle_errors {
    rewrite * /404.html
    file_server
  }
  @assets path /assets/*
  header @assets Cache-Control "public, max-age=31536000, immutable"
  header Cache-Control "no-cache"
}
```

Caddy obtains and renews the certificate itself; nginx needs certbot or another ACME client.

### GitHub Pages

The engine's own site, `https://beedywool.github.io/blacklight-engine/`, is deployed by `.github/workflows/pages.yml`. A project site lives under the repository's name, so the workflow builds with `DOCS_BASE=/blacklight-engine/`. GitHub Pages hosts one site per repository and every deployment replaces all of it, so the same workflow also builds the [module registry](/guide/deploy-registry) into `registry/` of the same folder:

```
site/
  index.html, guide/, api/, playground.html, assets/, runner/ ...   docs (docs/.vitepress/dist)
  404.html                                                           VitePress's not-found page
  registry/v1/index.json, registry/v1/modules/<name>.json            module registry
  .nojekyll
```

It runs after each successful run of the Release workflow started by a tag push, and by hand:

```sh
gh workflow run pages.yml --ref main -f tag=v1.2.0   # empty tag: the latest release
```

Each run checks out the source of the release tag, so the site documents the released version, not the work in progress on `main`. The workflow run itself is on `main` because the repository's `github-pages` environment accepts deployments from `main` only; a job of the Release workflow runs on the tag and is refused ("Tag v1.0.0 is not allowed to deploy to github-pages due to environment protection rules"). `workflow_run` always runs on the default branch, which is why the deployment is a workflow of its own and not a job of the release.

Setup, once: repository Settings > Pages > Source: "GitHub Actions". The `.nojekyll` file stops GitHub Pages from running Jekyll on the folder, which would skip files whose names start with an underscore. GitHub Pages sets its own cache headers (10 minutes on everything) and does not let you change them or add a CSP.

A custom domain later: add it in Settings > Pages (`docs.example.com`, a `CNAME` DNS record to `beedywool.github.io`), then set `DOCS_BASE: /` in `pages.yml` (the site is then at the root of that domain) and change `DEFAULT_REGISTRY` in `packages/cli/src/commands/registry.ts` to `https://docs.example.com/registry` in the next release. GitHub redirects the `github.io` address to the domain, so CLIs of earlier releases keep reaching the registry.

To deploy a fork's docs to its own Pages site, change `/blacklight-engine/` in `pages.yml` to the fork's repository name.

## Headers

| Header                    | Value                                 | Why                                                                                     |
| ------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| `Cache-Control` on HTML   | `no-cache`                            | Pages name the hashed bundles; a cached page after a new build points at removed files. |
| `Cache-Control` on assets | `public, max-age=31536000, immutable` | Files under `/assets/` carry a content hash in their name.                              |
| `X-Content-Type-Options`  | `nosniff`                             | Bundles must be served as JavaScript; the browser refuses to guess.                     |
| `Content-Security-Policy` | optional, see below                   | The site loads nothing from other origins: fonts, scripts and images are all local.     |

The site loads no third-party resource (the fonts are bundled, the search index is local), so a policy can be strict. Two points decide what it must allow. VitePress writes small inline `<script>` elements into every page (the dark-mode and platform checks, and the map of hashed chunk names), so `script-src 'self'` alone blocks the site; allow them with their hashes, taken from the built HTML, or with `'unsafe-inline'`. The playground compiles WebAssembly and starts workers like any engine build, so it needs `'wasm-unsafe-eval'` and `worker-src 'self' blob:`, the same entries as the release policy of games (`contentSecurityPolicy()` in `packages/core/src/security/config.ts`). A starting point, to tighten after testing the built site:

```
default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-src 'self' blob:; frame-ancestors 'self'
```

A playground example that connects to a relay or a reference server needs that server's origin (`wss://relay.example.com`, `https://api.example.com`) added to `connect-src`.

## Updating

Build again and replace the content of the web root. Upload the new `/assets/` files before the HTML, or keep the previous build's assets for a while: a visitor whose page loaded before the switch still requests the old chunk names when navigating.

## Limits

- The site is static: there is no server-side search, analytics, comments or form handling. Search runs in the browser on an index built at `pnpm docs:build`.
- The playground runs entirely in the visitor's browser. It cannot run desktop or mobile features (native modules, Steam, file system access) and has the same browser support as a web build.
- The build writes no host configuration (`_headers`, nginx or Caddy files); headers are set on the host as shown above.
- A build serves one path: moving the site to another path or domain needs a new build with the matching `DOCS_BASE`.
