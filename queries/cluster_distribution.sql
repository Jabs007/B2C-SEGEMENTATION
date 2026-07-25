-- Query to show K-Means cluster distribution
-- Run this in your PostgreSQL database

SELECT 
    clusterId as cluster,
    COUNT(*) as customer_count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM customer_clusters 
WHERE modelVersion = (
    SELECT version 
    FROM ml_models 
    WHERE model_name = 'kmeans_rfm_segmentation' 
    ORDER BY created_at DESC 
    LIMIT 1
)
GROUP BY clusterId 
ORDER BY clusterId;

-- Also show the model metadata
SELECT 
    model_id,
    version,
    n_clusters,
    silhouette_score,
    inertia,
    created_at
FROM ml_models 
WHERE model_name = 'kmeans_rfm_segmentation' 
ORDER BY created_at DESC 
LIMIT 1;

-- To see actual RFM characteristics of each cluster, join with customers:
SELECT 
    c.clusterId as cluster,
    COUNT(*) as count,
    ROUND(AVG(cust.recency), 1) as avg_recency,
    ROUND(AVG(cust.frequency), 1) as avg_frequency,
    ROUND(AVG(cust.monetary), 2) as avg_monetary,
    ROUND(AVG(cust.aov), 2) as avg_aov,
    ROUND(AVG(cust.tenure), 1) as avg_tenure_days
FROM customer_clusters c
JOIN customers cust ON c."customerId" = cust."customerId"
WHERE c.modelVersion = (
    SELECT version 
    FROM ml_models 
    WHERE model_name = 'kmeans_rfm_segmentation' 
    ORDER BY created_at DESC 
    LIMIT 1
)
GROUP BY c.clusterId 
ORDER BY c.clusterId;
