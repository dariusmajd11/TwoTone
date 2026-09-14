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

### AWS resources

These all live in one account in `us-east-1`. The account ID, pool ID, and
client ID are deployment details rather than code — they belong in `.env.local`
and in the Vercel project settings, not in a public repo:

- **S3 bucket `twotone-images`** — all public access blocked. Images are served
  through `/api/uploads/[key]`, which reads from S3 server-side, so the bucket
  never needs to be public.
- **DynamoDB `twotone-users`** — partition key `id` (string), plus a global
  secondary index `email-index` on `email`. The GSI exists because login looks
  users up by email, and DynamoDB can only query by key.
- **DynamoDB `twotone-history`** — partition key `userId`, sort key `createdAt`.
  Sorting on `createdAt` is what makes newest-first history a cheap reverse
  query instead of a full scan.
- **Cognito pool `twotone`** — app client `twotone-server` with a client secret
  and `ALLOW_USER_PASSWORD_AUTH`. Because the client has a secret, every call
  sends a `SECRET_HASH`; `src/lib/aws/auth.ts` computes it.
- **IAM user `twotone-app`** — the credentials the app actually runs as. Its
  inline policy grants only what the code calls: `PutObject`/`GetObject` on
  `twotone-images/uploads/*`, `PutItem`/`GetItem`/`Query` on the two tables and
  the GSI, and four Cognito actions on that one pool. It deliberately cannot
  list buckets, scan tables, or touch IAM.

Both tables are `PAY_PER_REQUEST`, so they cost nothing when idle.

### A note on signup

Cognito leaves new signups `UNCONFIRMED`, which would block login until the user
entered an emailed code. `CognitoAuthProvider.register` calls
`AdminConfirmSignUp` server-side instead, so registration stays one step — and
sets `email_verified` so a future forgot-password flow has somewhere to send the
code. The tradeoff is that nobody proves they own the address they sign up with.
Adding real verification means a confirmation route plus a code-entry UI step.

Passwords must be at least 12 characters with an uppercase letter, a lowercase
letter, and a number. The pool enforces this, but the pool only answers once a
request reaches AWS and the local fallback provider has no policy at all — so
`src/lib/password.ts` holds the same rule for the form and the register route.
**If you change the policy on the pool, change that file too**; nothing detects
the drift for you.

### A note on what gets stored

Photos are only written to S3 when someone is signed in. A signed-out visitor
gets the same full result, identified from bytes held in memory, but nothing is
kept — without an account there is nowhere to show the photo again, so storing
it would leave an object in the bucket that nothing can reach and nothing will
ever delete. `imageKey` and `imageUrl` on the record are null in that case.

This is why `/api/identify` resolves the session *before* touching storage.
Moving that call back below the upload would silently start collecting orphans
again.

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
    page.tsx          the chat-style interface, Identify/History tabs
  components/         GarmentCard, HistoryPanel, AuthMenu
  lib/
    aws/              storage, users, auth — each local + AWS
    identify.ts       Claude vision identification
    marketplaces.ts   resale and retail search links
    session.ts        signed session cookie
    types.ts          the domain model
```
