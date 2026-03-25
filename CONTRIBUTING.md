# Contributing To NovaSupport

## Project Goal

NovaSupport is a Stellar-native support platform focused on helping maintainers, creators, and developers receive transparent community funding through Stellar. The near-term goal is a submission-ready MVP with public profiles, wallet connection, and obvious Stellar Testnet integration.

## Contribution Rules

- keep changes small and focused
- preserve the split between `frontend/`, `backend/`, and `contract/`
- prefer readable code over abstraction-heavy patterns
- document intent clearly when a feature is scaffolded but not complete
- do not switch the target network away from Stellar Testnet in MVP work
- keep Freighter as the first wallet unless the team explicitly expands wallet support
- write working test
- build project before contribution and before commiting.


## Environment Setup

### Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

### Contract

```bash
cd contract
rustup target add wasm32-unknown-unknown
cargo test
```

Install Soroban CLI separately if you want to build, deploy, or inspect the contract on Stellar Testnet.


## Guidance For Small PRs

- one concern per PR is ideal
- include screenshots for frontend UI changes
- include schema notes for Prisma changes
- mention any new environment variables explicitly
- keep naming consistent with `NovaSupport`


## Branch Protection & CI

All pull requests must pass the following CI status checks before merging to `main`:

- **Frontend CI** — installs dependencies, runs tests, and builds the Next.js app (`npm run build`)
- **Backend CI** — generates the Prisma client, applies migrations, runs backend tests (`npm run test`), and compiles TypeScript (`npm run build`)
- **Contract CI** — builds the contract for native and WASM targets (`cargo build --release`) and runs contract tests (`cargo test`)

Each workflow runs on `pull_request` events for its respective directory and on `push` to `main`. Frontend CI and Backend CI test against Node.js 18.x and 20.x.

### Setting Up Branch Protection (Maintainers)

1. Go to **Settings → Branches** on the GitHub repo
2. Click **Add branch ruleset** (or edit the existing `main` rule)
3. Set the target branch to `main`
4. Enable **Require status checks to pass before merging**
5. Add the following required status checks:
   - `Test and build (Node.js 18.x)` (Frontend CI)
   - `Test and build (Node.js 20.x)` (Frontend CI)
   - `Backend checks (Node 18.x)` (Backend CI)
   - `Backend checks (Node 20.x)` (Backend CI)
   - `Contract checks` (Contract CI)
6. Enable **Require a pull request before merging**
7. Optionally enable **Require conversation resolution before merging**
8. Save the ruleset


