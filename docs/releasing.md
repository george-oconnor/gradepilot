# Releasing the iOS app

Four GitHub Actions workflows handle checks, over-the-air (OTA) updates and builds. They mirror Loaded's, so everything can be run from GitHub (or from a Claude Code cloud session) without a Mac.

| Workflow | When it runs | What it does |
|---|---|---|
| **Mobile checks** | Every PR, and before every OTA update or build | Type-check (`tsc --noEmit`, must be clean) and confirms the profiles used for promotion share the same `EXPO_PUBLIC_*` settings. |
| **Mobile OTA update** | Every push to `master` that changes app JavaScript (or run by hand) | Publishes an EAS Update to the **`internal`** channel. Only internal-profile builds receive it, never App Store users. Skipped automatically if the push changes native code or config. |
| **Mobile promote update** | By hand | Republishes the tested update, unchanged, to `production` and `testflight`, the channels App Store builds listen on. |
| **Mobile build iOS** | By hand | Builds an `.ipa` (production, testflight or internal profile) and, optionally, submits it to TestFlight. |

## Typical flow

1. **JavaScript-only fix** (anything in `App.tsx` etc.): merge to `master` → "Mobile OTA update" publishes it to `internal` → open GradePilot on your test phone (an internal build) to check it → run **Mobile promote update** → App Store users get it the next time they open the app.
2. **Native change** (new native package, `app.json`, `eas.json`, the app icon or splash, or a new app version): run **Mobile build iOS** with profile `production` → it uploads to TestFlight → release it in App Store Connect as usual.

**Which version am I on?** The bottom of the sidebar shows e.g. **GradePilot 1.0.1 · update 12 · 4670153**: the app version, then the update number (the "Mobile OTA update" run that published it, also shown in that run's summary) and its commit. Promoting keeps the same number. "built-in" means the app hasn't downloaded an update yet; close and reopen it (an update downloads on one launch and applies on the next).

OTA updates only reach builds with the **same app version** (`runtimeVersion` policy `appVersion`). After bumping `version` in `app.json`, ship a build first. Builds made before OTA was set up (1.0.1 build 8 and earlier) can't receive updates at all: they don't include `expo-updates`.

## Where builds run

| Option | Cost | Notes |
|---|---|---|
| `eas-cloud` | Your Expo plan's build quota | Simplest. The job ends immediately; follow the build on expo.dev. Auto-submits when done. |
| `github-macos` | Free (the repo is public, so GitHub's macOS runners cost nothing) | Runs `eas build --local` on GitHub's Mac with the latest stable Xcode. The `.ipa` is kept as an artifact for 7 days. |

There's deliberately no "my Mac" self-hosted runner option, unlike Loaded: on a public repo, pull requests from forks could run code on it.

Build numbers are managed by EAS (`appVersionSource: remote` with `autoIncrement`, currently at 8), so the `buildNumber` in `app.json` is ignored.

## One-time setup

1. **Expo access token:** on expo.dev, go to Account settings → Access tokens and create one. Add it to this repo on GitHub (Settings → Secrets and variables → Actions) as the secret **`EXPO_TOKEN`**. (GitHub secrets are per repo, so Loaded's copy isn't visible here; a new token or the same token value both work.)
2. **App version:** the `version` in `app.json` (now 1.0.1) must be higher than any version Apple has already approved, or the upload is refused ("version is not accepted for new build submissions"). If 1.0.1 is already live or approved, bump it (e.g. to 1.0.2) before the first build.
3. **First build with OTA:** run **Mobile build iOS** with profile `production`, `eas-cloud`, submit on. This build includes `expo-updates`, so it's the first one that can receive OTA updates.
4. **A test phone on the `internal` channel:** run "Mobile build iOS" with profile `internal`. New devices need registering first with `npx eas-cli device:create` (it gives a link to open on the phone).
5. **Sentry (optional):** the app reads `EXPO_PUBLIC_SENTRY_DSN`, which isn't in the repo or on EAS yet, so CI builds and updates currently run without Sentry. Add it on expo.dev → the project → Environment variables, in the **production** environment (every profile builds with `environment: production`, and updates are published with it too).
6. **Optional, approval before promoting:** in GitHub, go to Settings → Environments → `app-store` → Required reviewers, so "Mobile promote update" waits for your click.

## Notes

- **Settings in updates:** the OTA bundle is built with the `internal` profile's `env` from `eas.json`, via `scripts/ci/eas-profile-env.mjs`, plus EAS "production" environment variables. If you add an `EXPO_PUBLIC_*` value to one profile, add it to `_base` (or to `internal`, `testflight` and `production` alike), or promotion will refuse to run.
- **Distribution certificate:** the App Store distribution certificate on EAS expires on 25 December 2026. EAS offers to create a new one on the next build after that; a non-interactive CI build can't log in to Apple to do that and will fail, so renew it beforehand with `npx eas-cli credentials` → iOS → production → Distribution Certificate.
- **Source maps:** Sentry source maps aren't uploaded (`SENTRY_DISABLE_AUTO_UPLOAD`), so stack traces will be minified.
