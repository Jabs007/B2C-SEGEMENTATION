B2C Customer Segmentation App


A full-stack, ML-powered customer analytics and segmentation platform built for Statspeak as part of a Bachelor of Science in Data Science internship project.




Overview

The B2C Customer Segmentation App is an end-to-end data science deployment that transforms raw invoice and customer contact data into actionable customer segments using unsupervised machine learning. The platform enables marketing teams, data scientists, and business strategists to understand customer behavior, predict segment membership for new customers, and automate recurring segmentation pipelines — all through a clean, professional web interface.

The project follows an 8-phase data science methodology — from business framing and data auditing through feature engineering, dimensionality reduction, clustering, and finally deployment as an interactive web application.




Live Demo


Deployed on Manus Cloud — View Live App




Screenshots

Dashboard
Segment Explorer






















Prediction Engine
Segment Profiles

























Features

1. Interactive Dashboard

Real-time KPI cards showing total customers, total revenue (KES), average order value, and segment distribution across Champions, Loyal, At Risk, and Regulars. Includes a live donut chart of segment proportions powered by Recharts.

2. Customer Prediction Engine

A five-field form accepting Recency, Frequency, Monetary, AOV, and Tenure inputs. The backend computes Euclidean distances to the four K-Means centroids in Z-score space and returns the nearest segment with a confidence score and a business-friendly recommendation.

3. Segment Explorer

A fully paginated, filterable, and sortable table of all processed customers displaying their cluster assignment, RFM scores, and behavioral features. Supports search by customer ID and filter by segment.

4. Visualizations Gallery

Static and dynamically-referenced charts from the EDA phase including:

•
Feature distribution histograms

•
Correlation heatmap

•
Bivariate scatter plots

•
UMAP 2D projection

•
Elbow curve and Silhouette score validation

5. Segment Profile Detail Pages

Per-segment radar charts comparing Champions, Loyal, At Risk, and Regulars across five RFM dimensions. Each profile includes a business-friendly narrative description and recommended marketing actions.

6. Pipeline Management

Manual pipeline trigger, run history log, and scheduled recurring jobs (powered by Manus Heartbeat cron). Supports configurable cron expressions (e.g., 0 2 * * 1 for weekly Monday runs).

7. Data Upload Interface

CSV upload interface for raw Zoho Books invoice exports and customer contact files. The pipeline automatically cleans, feature-engineers, clusters, and inserts all customers into the database after upload.

8. Report Viewer

Inline markdown rendering of the full 8-phase project methodology report with a downloadable ZIP export containing all code, models, CSVs, and documentation.




The 8-Phase Methodology

Phase
Title
Description
1
Business Framing
Defined segmentation objectives, KPIs, and the unit of analysis (contact_number)
2
Data Audit & Cleaning
Null checks, ID normalization, date parsing, duplicate removal, orphan detection
3
Feature Engineering
Computed Recency, Frequency, Monetary, AOV, and Tenure for every unique customer
4
Exploratory Data Analysis
Distribution plots, correlation heatmap, bivariate scatter, descriptive statistics
5
Dimensionality Reduction
PCA for explained variance, UMAP for 2D cluster visualization
6
Clustering & Validation
K-Means with elbow curve and Silhouette score validation
7
Segment Profiling & Naming
Radar charts, business narratives, and marketing strategies per segment
8
Deployment & Automation
Full-stack web app with automated pipeline and interactive dashboard







Customer Segments

Segment
Profile
Strategy
Champions
High frequency, high monetary, low recency (bought recently)
Reward and retain — loyalty perks, early access
Loyal
Consistent buyers with high AOV and long tenure
Upsell and cross-sell — premium bundles, referral programs
At Risk
Previously active customers with high recency (not bought recently)
Win-back campaigns — discount codes, re-engagement emails
Regulars
Average across all RFM dimensions — the core base
Nurture and grow — targeted promotions, frequency incentives







Tech Stack

Frontend

•
React 19 with TypeScript

•
Tailwind CSS 4 for styling

•
shadcn/ui component library

•
Recharts for data visualizations

•
Wouter for client-side routing

•
Framer Motion for animations

Backend

•
Node.js with Express 4

•
tRPC 11 for end-to-end type-safe API

•
Drizzle ORM with MySQL/TiDB

•
Multer for CSV file upload handling

•
csv-parse for CSV parsing

Machine Learning (Python — Offline Training)

•
pandas for data manipulation

•
scikit-learn for K-Means clustering, StandardScaler, PCA, Silhouette Score

•
umap-learn for UMAP dimensionality reduction

•
matplotlib / seaborn for EDA visualizations

•
joblib for model serialization

Infrastructure

•
Manus Cloud for hosting and deployment

•
Manus Heartbeat for scheduled pipeline automation

•
MySQL/TiDB for persistent storage




Project Structure

Plain Text


b2c_segmentation_app/
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx       # KPI cards and segment overview
│   │   │   ├── Predict.tsx         # Single-customer prediction form
│   │   │   ├── Explorer.tsx        # Filterable customer table
│   │   │   ├── Visualizations.tsx  # EDA and clustering charts
│   │   │   ├── SegmentProfiles.tsx # Radar charts per segment
│   │   │   ├── Pipeline.tsx        # Pipeline management and scheduling
│   │   │   ├── DataUpload.tsx      # CSV upload interface
│   │   │   └── ReportViewer.tsx    # Markdown report + ZIP export
│   │   ├── components/
│   │   │   └── DashboardLayout.tsx # Sidebar navigation
│   │   └── App.tsx                 # Routes and theme
├── server/
│   ├── pipeline.ts                 # Core ML pipeline (clean → engineer → cluster → insert)
│   ├── routers.ts                  # tRPC procedures for all features
│   ├── db.ts                       # Drizzle query helpers
│   └── _core/
│       ├── index.ts                # Express server + upload endpoint
│       └── heartbeat.ts            # Scheduled job SDK
├── drizzle/
│   └── schema.ts                   # Database schema (customers, pipeline_runs, scheduled_jobs)
├── config/
│   └── centroids.json              # K-Means centroids in Z-score space
└── shared/
    └── segments.ts                 # Segment names, colors, descriptions






Getting Started

Prerequisites

•
Node.js 22+

•
pnpm 10+

•
MySQL or TiDB database

Installation

Bash


# Clone the repository
git clone https://github.com/Jabs007/b2c-customer-segmentation.git
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



The app will be available at http://localhost:3000.

Running Tests

Bash


pnpm test






How to Use

1.
Start fresh — open the app and navigate to the Data Upload page.

2.
Upload your CSVs — provide your Zoho Books invoice export and customer contacts file.

3.
Run the pipeline — click "Process & Re-segment" and watch the step-by-step logs.

4.
Explore your segments — navigate to the Dashboard to see your customers distributed across the 4 segments.

5.
Predict new customers — use the Prediction Engine to instantly classify a customer based on their RFM values.

6.
Automate — set up a recurring job on the Pipeline page to re-segment automatically every week.




Data Requirements

Invoice CSV (Zoho Books Export )

The pipeline reads the following columns from your invoice export:

Column
Description
contact_number
Unique customer identifier
date
Invoice date (DD/MM/YYYY or YYYY-MM-DD)
total
Invoice total in KES
status
Payment status (paid, overdue, etc.)
customer_name
Customer display name




Contacts CSV

Column
Description
contact_id
Unique contact identifier
contact_name
Full name
created_time
Registration/first contact date







Author

Adams Jabali Momanyi
BSc Data Science — 2025 Graduate
Data Science Intern @ Statspeak

•
Portfolio: jabali-porfolio.vercel.app

•
GitHub: @Jabs007

•
LinkedIn: Adams Jabali




Acknowledgements

This project was developed under the supervision of the Statspeak data team as part of a Bachelor of Science in Data Science internship program. The methodology follows industry best practices for unsupervised customer segmentation using RFM analysis and K-Means clustering.




License

MIT License — feel free to use this as a reference for your own segmentation projects.

