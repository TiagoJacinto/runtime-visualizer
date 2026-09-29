# Deployment

## Current scope

Deploy the browser frontend only. The first release has no user accounts, backend, database, or cross-device synchronization. The app reads folders chosen in the browser and keeps workspace data in browser storage. A folder path saved by a server would not make that folder available on another device.

Future account and project-persistence requirements are tracked in [issue #81](https://github.com/TiagoJacinto/runtime-visualizer/issues/81). Resolve the related product question there before adding server-side accounts or storage.

## Environments

| Environment | Purpose | Deployed? |
| --- | --- | --- |
| Local | Developer workstation for changes and local tests | No |
| CI | GitHub Actions runs the quality checks, builds the frontend, and stores the tested artifact | No |
| Production | One public HTTPS frontend at the free Cloudflare Pages `pages.dev` address | Yes |

There is no separate development, integration, test, or staging website. Pull requests run CI but do not publish production. Anyone with the production URL can load the app. No login is required.

## Hosting

- **Platform:** Cloudflare Pages.
- **Plan and URL:** Free Pages plan and its `pages.dev` hostname. No paid domain is required.
- **Application type:** Static Vite frontend. Do not add Docker or a server for this deployment.
- **Repository:** This repository remains the source of truth. Configure the Pages project for artifact uploads, not automatic Git builds.

Cloudflare Pages serves this single-page app from `browser/dist`. Its default SPA handling maps unmatched paths to the app entry point.

## CI and continuous deployment

`.github/workflows/quality-gates.yml` is CI. It runs on pull requests, pushes to `main`, and the scheduled check. Production deploys only from a push to `main` after all quality jobs pass.

After the static quality job builds the frontend, CI uploads `browser/dist` as the `frontend-dist` artifact and keeps it for 90 days. The deployment workflow downloads that exact artifact. It does not rebuild the source.

`.github/workflows/deploy-frontend.yml` supports two triggers:

1. **Automatic:** the `Quality gates` workflow calls the deployment workflow after lint, build, acceptance, regression, and aggregate quality checks pass on a push to `main`.
2. **Manual:** run the deployment workflow from GitHub Actions. It finds the latest completed push run on `main` where all quality jobs passed and deploys that run's `frontend-dist` artifact. A previous deployment failure does not prevent redeploying that artifact. If the artifact is unavailable, deployment fails. Run CI on `main` again to create a fresh artifact.

The deployment job checks the production HTTP response, then opens the site in Chromium and confirms that the app renders without page errors. If post-deploy verification fails, the workflow restores the previous successful Pages production deployment and reports failure.

## Required GitHub configuration

Create the Cloudflare Pages project before enabling deployment. Add these repository settings:

- **Actions secrets:** `CLOUDFLARE_API_TOKEN` with Cloudflare Pages edit permission; `CLOUDFLARE_ACCOUNT_ID`.
- **Actions variables:** `CLOUDFLARE_PAGES_PROJECT` with the Pages project name; `PRODUCTION_URL` with the full public HTTPS `pages.dev` URL.

Keep the token in a GitHub Actions secret. Do not put credentials in the repository.

## Release behavior

A failed quality gate prevents the automatic deployment. A failed upload or production smoke test fails the deployment workflow. If a deployment was uploaded before its smoke test failed, the workflow attempts to restore the previous production deployment. The deployment remains marked failed even after a successful rollback.
