# LearnMarket Backend

NestJS REST API powering the LearnMarket EdTech marketplace.

## Tech Stack

- **Framework**: NestJS 10
- **Language**: TypeScript
- **Database**: PostgreSQL 16 with Prisma ORM
- **Authentication**: JWT with httpOnly cookies + refresh token rotation
- **Container**: Docker
- **Cloud**: AWS (EC2, RDS, S3)

## Prerequisites

- Node.js 20+
- Docker Desktop
- npm or pnpm

## Quick Start

```bash
# Clone the repo
git clone git@github.com:learnmarket/learnmarket-backend.git
cd learnmarket-backend

# Copy environment variables
cp .env.example .env

# Start local services (Postgres + Redis)
docker compose up -d

# Install dependencies
npm install

# Run database migrations
npx prisma migrate dev

# Start the dev server
npm run start:dev
```

The API will be available at http://localhost:3000

## Project Structure
src/
├── main.ts              # Application bootstrap
├── app.module.ts        # Root module
├── auth/                # Authentication module
├── users/               # User management
├── tutors/              # Tutor profiles
├── learners/            # Learner profiles
├── requests/            # Learning requests
├── proposals/           # Learning plans (proposals)
├── sessions/            # Live sessions
├── escrow/              # Payment escrow
├── messaging/           # Real-time chat
└── common/              # Shared utilities

## Development

### Running tests

```bash
npm run test           # Unit tests
npm run test:e2e       # End-to-end tests
npm run test:cov       # Coverage report
```

### Database

```bash
# Create a new migration
npx prisma migrate dev --name add_xxx_table

# Apply migrations
npx prisma migrate deploy

# Open Prisma Studio (GUI for DB)
npx prisma studio
```

## Deployment

This project follows a CI/CD pipeline:

- Push to `develop` → automatic deployment to staging
- Push to `main` with tag `v*` → deployment to production (manual approval required)

See `.github/workflows/` for deployment configurations.

## Contributing

1. Create a feature branch from `develop`: `git checkout -b feature/your-feature`
2. Make your changes with conventional commits
3. Push and create a pull request to `develop`
4. Wait for CI checks and code review
