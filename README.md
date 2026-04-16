# tc-management

This repository is a Node.js + TypeScript service used by BLab. Below are concise English instructions for setup, build and deployment, and third-party integrations.

## Quick start

- Copy `.env.example` to `.env` and fill required values.
- Ensure `gapikey.json` (if used) is present at project root or set `GAPI_KEY_FILE`.
- Install dependencies and build:

```bash
pnpm install
pnpm run build
# or
# npm install
# npx tsc -p tsconfig.json
```

## Deploying to a server (manual ZIP approach)

1. Build the project (see above).
2. Create a package with the `dist/` output, `package.json` and `.env` (and `gapikey.json` if needed). Zip and upload to your server.
3. On the server unzip to a folder (e.g. `/var/www/tc-management`) and install production dependencies if required:

```bash
pnpm install --prod
# or
npm install --production
```

4. Start the app using a process manager (pm2). Example command:

```bash
pm2 start dist/app.js --name tc-management
pm2 save
```

<!-- The docs previously included an example `ecosystem.config.js`. That example has been removed from the docs — follow the manual ZIP-based deploy instructions in `docs/DEPLOY_AND_SETUP.md`. -->
## Important environment variables

See `.env.example` for a full list. Key entries include:

- PORT, NODE_ENV
- DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME (MySQL)
- REDIS_HOST, REDIS_PORT, REDIS_PASS
- JWT_SECRET, SESSION_SECRET
- SLACK_WEBHOOK_URL / SLACK_BOT_TOKEN
- KNACK_APP_ID / KNACK_API_KEY
- GOOGLE credentials or `gapikey.json`
- FIREBASE service account fields (for dynamic links)

## Third-party services referenced

- Slack — incoming webhooks or bot tokens for notifications
- Knack — app ID and API key for the Knack backend
- Google APIs — Drive/Sheets and other Google services (service account JSON or OAuth credentials)
- Firebase — Dynamic Links / short links (service account)
- ClickSend — SMS provider (username + API key)
- Monday.com — API token

## Database (brief descriptions)

- Account tokens (`src/db/models/account-token.model.ts`): stores tokens used by the TC dashboard. Each record holds a user's token so the frontend/dashboard can fetch and display user-specific information.

- monday_app_log (`src/db/models/monday-app-log.model.ts`): stores logs produced by services in this application — use this table to review internal events and errors.

- monday_board_app_log (`src/db/models/monday-board-app-log.ts`): stores the Monday board IDs used to hold log items for the TC team. Because each Monday board has a ~10k item limit, the app creates a new board when an existing board approaches the limit and saves its ID here so operators can find the correct board for historical logs.