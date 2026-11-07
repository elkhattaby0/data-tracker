# Security and GitHub Pages Deployment

This repository is a public static frontend. Files published here and code delivered to visitors' browsers are public.

## Safe contents

- `index.html`: frontend only; no hardcoded password, API key, spreadsheet credential, or backend source.
- `SECURITY.md`: public security and deployment guidance.

Do not add `plan.html`, Apps Script source, credentials, private spreadsheet exports, `.env` files, backups, or deployment secrets. The Apps Script endpoint URL is retained in the frontend as requested; the endpoint must independently enforce access controls and must not rely on obscurity.

## Password and data handling

The page asks for a password at runtime and keeps it in page memory only; it does not persist it in localStorage. It sends the supplied password to the configured backend to authenticate and load data. Because this is a static site, the browser and its network requests can be inspected. Never put the password itself in this repository or treat this frontend as a secret store. Store backend credentials in the backend's private configuration (such as Apps Script Script Properties), rotate any credential that has been committed, and remove leaked secrets from Git history.

The current Apps Script JSONP read protocol puts the runtime password in a request URL. URLs may be recorded in browser history, network logs, or service logs. For sensitive production use, migrate the backend/frontend to a short-lived server-side session and a JSON API over HTTPS; do not assume JSONP or client-side checks are a security boundary. The backend must authenticate and authorize every read/write and specific operation ID, validate inputs, limit attempts, and return only authorized data. Frontend delete confirmation is not authorization.

## Rendering and deployment

Treat backend data as untrusted. Escape it before inserting into HTML, use text APIs where practical, and test with hostile-looking values. The dashboard uses third-party CDN libraries only if configured; review/pin dependencies and use integrity protection where available. Enable GitHub secret scanning and push protection, use HTTPS, and do not publish personal or financial data unless intended for public access.

Enable GitHub Pages from the `main` branch and `/` (root). The site entry point must be the root `index.html`. Verify the generated Pages URL loads over HTTPS and test login, data loading, add/delete authorization, filters, mobile layout, and refresh after deployment.
