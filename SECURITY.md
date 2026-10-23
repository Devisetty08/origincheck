# Security

## Reporting a problem

If you find a security problem in origincheck, please don't open a public issue. Report it privately through GitHub instead: on this repository's **Security** tab, choose **Report a vulnerability**. Include what you found, how to reproduce it, and what someone could do with it.

You'll get a reply within a week. Fixes are released as a new version, with credit to you if you'd like it.

## What's in scope

origincheck runs a small server next to the app, and that server matters most:

- **API keys:** the server holds them in `web/.env.local` and must never send them to the browser or write them to logs.
- **The web-page fetcher** (`/api/fetch-url`): it must refuse private and internal network addresses, including after redirects.
- **Search routes:** they must accept only short phrases, never whole documents.
- **Settings:** the page must only write keys on your own computer (in development, or with `ALLOW_SETTINGS_WRITE`), and never for another device on the network.
- **Personal features:** Zotero import and the free-model gateway use your own accounts, so they must be refused on a hosted deployment and for phones or other computers on the same network.

The "only on this computer" check (`web/src/server/local.ts`) stops other devices' browsers. Someone sending hand-made requests could get around it, so on a computer shared with people you don't trust, don't add personal keys at all.

## Supported versions

Only the latest release gets security fixes.
