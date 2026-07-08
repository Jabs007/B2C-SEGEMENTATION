# B2C Customer Segmentation App

A full-stack, ML-powered customer analytics and segmentation platform built for Statspeak as part of a Bachelor of Science in Data Science internship project.

## Overview

The B2C Customer Segmentation App is an end-to-end data science deployment that transforms raw invoice and customer contact data into actionable customer segments using unsupervised machine learning. The platform enables marketing teams, data scientists, and business strategists to understand customer behavior, predict segment membership for new customers, and automate recurring segmentation pipelines all through a clean, professional web interface.

## Project Structure

```plaintext
b2c_segmentation_app/
├── .git/
├── .kilo/
├── .manus-logs/
├── .gitignore
├── .gitkeep
├── .prettierignore
├── .prettierrc
├── README.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── requirements.txt
├── docker-compose.yml
├── docker-compose.mage.yml
├── components.json
├── drizzle.config.ts
│
├── client/
├── server/
├── shared/
├── config/
├── drizzle/
├── node_modules/
├── patches/
├── references/
│
├── etl/              ← Created
│   ├── etl_pipeline_clickhouse.py
│   ├── etl_pipeline_integrated.py
│   ├── generate_visualizations.py
│   ├── seed_clickhouse.py
│   ├── clickhouse_init.sql
│   └── README.md
│
├── migrations/       ← Created
│   ├── migrate_tables.cjs
│   ├── verify_migration.py
│   └── README.md
│
├── setup/            ← Created
│   ├── check_tables.cjs
│   ├── create_db.cjs
│   └── README.md
│
├── docs/             ← Created
│   ├── AUTH0_SETUP.md
│   ├── todo.md
│   └── README.md
│
├── data/             ← Created
│   ├── test_write.txt
│   └── README.md
│
├── scripts/          ← Existing (now organized)
│   ├── etl/
│   │   ├── build_etl_integrated.py
│   │   ├── generate_visualizations.py
│   │   └── seed_clickhouse.py
│   ├── database/
│   │   ├── create_schedule.py
│   │   ├── exec_sql.py
│   │   └── inspect_pg.py
│   ├── utilities/
│   │   ├── test_ch_client.ts
│   │   └── validate_pipeline.py
│   ├── monitoring/
│   │   └── system_health.py
│   └── README.md
└── ...               ← Other directories unchanged
```

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 10+
- MySQL or TiDB database

### Installation

```bash
# Clone the repository
git clone <https://github.com/Jabs007/b2c-customer-segmentation.git>
cd b2c-customer-segmentation

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET

# Run database migrations
pnpm drizzle-kit generate
pnpm drizzle-kit migrate

# Start the development server
pnpm dev
```

The app will be available at <http://localhost:3000>.

## Author

Adams Jabali Momanyi
BSc Data Science  2025 Graduate
Data Science Intern @ Statspeak

- Portfolio: jabali-porfolio.vercel.app
- GitHub: @Jabs007
- LinkedIn: Adams Jabali

## Acknowledgements

This project was developed under the supervision of the Statspeak data team as part of a Bachelor of Science in Data Science internship program. The methodology follows industry best practices for unsupervised customer segmentation using RFM analysis and K-Means clustering.

## License

MIT License  feel free to use this as a reference for your own segmentation projects.