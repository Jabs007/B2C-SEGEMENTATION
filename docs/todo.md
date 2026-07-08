# B2C Customer Segmentation App - TODO

## Phase 1: Backend & Database Setup
- [x] Define database schema (customers, segments, pipeline_runs, predictions tables)
- [x] Upload ML model files (scaler.joblib, final_kmeans_model.joblib) to static assets
- [x] Build tRPC procedures: dashboard stats, customer list, predict, pipeline management
- [x] Seed database with customer_features.csv and segment_profiles.csv data (7,551 customers)
- [x] Write vitest tests for backend procedures (14 tests passing)

## Phase 2: Dashboard
- [x] Set up DashboardLayout with sidebar navigation for all 8 pages
- [x] Build segment overview cards (Champions, Loyal, At Risk, Regulars)
- [x] Show segment size, revenue share, avg recency/frequency/monetary per card
- [x] Add summary KPI bar (total customers, total revenue, avg order value, active segments)
- [x] Add segment distribution donut chart using recharts

## Phase 3: Core Feature Pages
- [x] Customer Prediction Page - form with recency, frequency, monetary, AOV, tenure inputs
- [x] Prediction result display with segment name, confidence, and description
- [x] Segment Explorer - filterable/sortable customer table with cluster, RFM, behavioral features
- [x] EDA Visualization Page - feature distribution plots, correlation heatmap
- [x] UMAP projection scatter plot page
- [x] Elbow/silhouette curve charts

## Phase 4: Advanced Feature Pages
- [x] Segment Profile Detail Pages - radar charts per segment with RFM dimensions
- [x] Business-friendly narrative descriptions per segment
- [x] Data Upload Interface - CSV upload for invoices and contacts
- [x] Pipeline Management Page - trigger batch re-segmentation, monitor status/logs
- [x] Schedule recurring segmentation jobs
- [x] Report Viewer - inline markdown renderer for B2C project report
- [x] ZIP download export from report viewer

## Phase 5: Polish & Delivery
- [x] Apply consistent elegant design system (Inter font, dark theme, refined spacing)
- [x] Ensure all pages are responsive and mobile-friendly
- [x] Add loading states, empty states, and error boundaries
- [x] Final checkpoint and delivery
