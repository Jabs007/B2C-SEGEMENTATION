# B2C Customer Segmentation App

<<<<<<< HEAD
A full-stack, ML-powered customer analytics and segmentation platform built for Statspeak
=======
A full-stack, ML-powered customer analytics and segmentation platform built for Statspeak as part of a Bachelor of Science in Data Science internship project.
>>>>>>> main

## Overview

The B2C Customer Segmentation App is an end-to-end data science deployment that transforms raw invoice and customer contact data into actionable customer segments using unsupervised machine learning. The platform enables marketing teams, data scientists, and business strategists to understand customer behavior, predict segment membership for new customers, and automate recurring segmentation pipelines through a clean, professional web interface.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 7, Tailwind CSS v4, shadcn/ui, React Query |
| Backend | Express + tRPC v11, Zod validation |
| Auth | Auth0 |
| Database | PostgreSQL (primary), ClickHouse (analytics / ETL sink) |
| ORM | Drizzle ORM |
| ML / Pipeline | scikit-learn (K-Means, RFM), Python ETL scripts |
| Orchestration | Mage AI |

## Project Structure

```plaintext
B2C APP/
├── client/                # React frontend (Vite, Tailwind v4, shadcn/ui)
│   └── src/
│       ├── components/    # UI + feature components
│       ├── pages/         # Route pages (Dashboard, Explorer, Predict, etc.)
│       └── App.tsx
├── server/                # Express + tRPC backend
│   ├── _core/             # App bootstrap, auth, env, cookies, trpc router
│   ├── routers.ts         # tRPC procedure definitions
│   ├── pipeline.ts        # ML segmentation pipeline
│   ├── clickhouse.ts      # ClickHouse client + queries
│   └── db.ts              # Drizzle ORM database connection
├── shared/                # Types and utilities shared between client/server
│   ├── types.ts
│   ├── segments.ts
│   └── const.ts
├── config/                # App configuration
│   └── centroids.json
├── drizzle/               # Drizzle ORM migrations and schema
│   ├── schema.ts
│   ├── relations.ts
│   └── migrations/
├── etl/                   # ClickHouse ETL and initialization
│   ├── etl_pipeline_clickhouse.py
│   ├── etl_pipeline_integrated.py
│   ├── seed_clickhouse.py
│   └── clickhouse_init.sql
├── scripts/               # Operational scripts
│   ├── etl/               #    ETL builders and visualization generators
│   ├── database/          #    DB inspection and schedule management
│   └── utilities/         #    ClickHouse client tests, pipeline validation
├── migrations/            # Legacy table migration scripts
├── setup/                 # DB creation and verification helpers
├── docs/                  # Documentation
│   ├── AUTH0_SETUP.md
│   └── todo.md
├── references/            # Feature reference docs (LLM, maps, storage, etc.)
├── docker-compose.yml     # ClickHouse service
├── docker-compose.mage.yml# Mage AI orchestrator (merges with primary compose)
├── requirements.txt       # Python dependencies
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL database
- ClickHouse (via Docker)
- Python 3.10+ (for ETL / ML scripts)

### Installation

```bash
# Clone the repository
git clone https://github.com/Jabs007/b2c-customer-segmentation.git
cd b2c-customer-segmentation

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL, CLICKHOUSE_URL, AUTH0 credentials, and JWT_SECRET

# Run database migrations
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

### Running Services

```bash
# Start ClickHouse
docker compose up clickhouse -d

# Optionally start Mage AI orchestrator
docker compose -f docker-compose.yml -f docker-compose.mage.yml up mage -d

# Start the development server
pnpm dev
```

The app will be available at `http://localhost:3000`.

## Optional: Python ETL Setup

```bash
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

## Author

Adams Jabali Momanyi  
<<<<<<< HEAD
BSc Data Science 2025 Graduate
=======
BSc Data Science 2025 Graduate  
Data Science Intern @ Statspeak
>>>>>>> main

- Portfolio: jabali-porfolio.vercel.app
- GitHub: @Jabs007
- LinkedIn: Adams Jabali

## Acknowledgements

<<<<<<< HEAD
This project was developed under the supervision of the Statspeak The methodology follows industry best practices for unsupervised customer segmentation using RFM analysis and K-Means clustering.
=======
This project was developed under the supervision of the Statspeak data team as part of a Bachelor of Science in Data Science internship program. The methodology follows industry best practices for unsupervised customer segmentation using RFM analysis and K-Means clustering.
>>>>>>> main

## License

MIT License — feel free to use this as a reference for your own segmentation projects.
