# TwoTone

Drop in a photo of a garment and TwoTone tells you what it is — brand, the year
and season it was made, whether it is still in production, and where to buy it
new or secondhand.

## Running it

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. It works immediately with no configuration: with no
`ANTHROPIC_API_KEY` set, identification returns a fixed sample garment so the UI
is developable, and uploads, accounts, and history are all stored on disk under
`.twotone-data/`.

Add `ANTHROPIC_API_KEY` to `.env.local` to identify real garments.

## How the AWS swap works

Every backend service has two implementations behind one interface — a local one
that writes to disk, and a real AWS one. `src/lib/env.ts` picks between them per
service at import time, so you can adopt S3, DynamoDB, and Cognito one at a time
without touching application code.

| Service         | Local fallback              | AWS        | Switches on                                                 |
| --------------- | --------------------------- | ---------- | ----------------------------------------------------------- |
| Image storage   | `.twotone-data/uploads/`    | S3         | `TWOTONE_S3_BUCKET`                                          |
| Users + history | `.twotone-data/*.json`      | DynamoDB   | `TWOTONE_DDB_USERS_TABLE`, `TWOTONE_DDB_HISTORY_TABLE`       |
| Auth            | scrypt-hashed local records | Cognito    | `TWOTONE_COGNITO_USER_POOL_ID`, `TWOTONE_COGNITO_CLIENT_ID`  |
| Identification  | fixed sample garment        | Claude API | `ANTHROPIC_API_KEY`                                          |

All AWS paths additionally require `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY`.

### AWS resources to create

- **S3 bucket** — private; images are served through `/api/uploads/[key]` rather
  than public URLs.
- **DynamoDB users table** — partition key `id` (string), plus a global secondary
  index named `email-index` with partition key `email`.
- **DynamoDB history table** — partition key `userId` (string), sort key
  `createdAt` (string). Sorting on `createdAt` is what makes newest-first history
  a cheap reverse query.
- **Cognito user pool** — with an app client that permits the
  `USER_PASSWORD_AUTH` flow.

## Deploying to Vercel

Set the same environment variables in the Vercel project settings. Note that the
local fallbacks write to disk, which does not persist on Vercel — so production
needs the AWS variables set for storage, accounts, and history to work.

## Layout

```
src/
  app/
    api/
      identify/       POST an image, get an identification back
      uploads/[key]/  serves stored images from S3 or disk
      auth/           register, login, logout, me
      history/        past identifications for the signed-in user
    page.tsx          the chat-style interface
  components/         GarmentCard, AuthMenu
  lib/
    aws/              storage, users, auth — each local + AWS
    identify.ts       Claude vision identification
    marketplaces.ts   resale and retail search links
    session.ts        signed session cookie
    types.ts          the domain model
```
