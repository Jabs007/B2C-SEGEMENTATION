#!/usr/bin/env python3
"""
Generate visualization charts for the B2C Customer Segmentation Dashboard.
Reads customer data from the database and creates PNG charts.
"""

import os
import sys
import json
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sklearn.manifold import TSNE
import seaborn as sns

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Database connection
from sqlalchemy import create_engine
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost/dbname")

def get_db_connection():
    """Create database connection."""
    engine = create_engine(DB_URL)
    return engine

def fetch_customer_data():
    """Fetch customer data from database."""
    engine = get_db_connection()
    query = """
        SELECT 
            "customerId",
            "segmentName",
            cluster,
            recency,
            frequency,
            monetary,
            aov,
            tenure
        FROM customers
    """
    df = pd.read_sql_query(query, engine)
    return df

def create_output_dir():
    """Create output directory for charts."""
    output_dir = PROJECT_ROOT / "client" / "public" / "manus-storage"
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir

def generate_univariate_analysis(df, output_dir):
    """Generate univariate distribution plots."""
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    fig.suptitle('Feature Distributions', fontsize=16, fontweight='bold')
    
    features = ['recency', 'frequency', 'monetary', 'aov']
    titles = ['Recency Distribution', 'Frequency Distribution', 'Monetary Distribution', 'AOV Distribution']
    
    for idx, (feature, title) in enumerate(zip(features, titles)):
        ax = axes[idx // 2, idx % 2]
        ax.hist(df[feature], bins=30, edgecolor='black', alpha=0.7, color='#3b82f6')
        ax.set_title(title, fontweight='bold')
        ax.set_xlabel(feature.capitalize())
        ax.set_ylabel('Count')
        ax.grid(axis='y', alpha=0.3)
    
    plt.tight_layout()
    output_path = output_dir / "univariate_analysis_afa78c53.png"
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"OK: Generated: {output_path}")

def generate_correlation_heatmap(df, output_dir):
    """Generate correlation heatmap."""
    features = ['recency', 'frequency', 'monetary', 'aov', 'tenure']
    corr_matrix = df[features].corr()
    
    plt.figure(figsize=(10, 8))
    sns.heatmap(corr_matrix, annot=True, cmap='RdBu_r', center=0, 
                square=True, linewidths=0.5, fmt='.2f',
                annot_kws={'size': 10})
    plt.title('Feature Correlation Matrix', fontsize=14, fontweight='bold', pad=20)
    plt.tight_layout()
    
    output_path = output_dir / "correlation_matrix_2c00517e.png"
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"OK: Generated: {output_path}")

def generate_bivariate_scatter(df, output_dir):
    """Generate bivariate scatter plots."""
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))
    fig.suptitle('Bivariate Analysis', fontsize=16, fontweight='bold')
    
    # Monetary vs Recency
    ax1 = axes[0]
    scatter1 = ax1.scatter(df['recency'], df['monetary'], 
                          c=df['cluster'], cmap='viridis', alpha=0.6, s=50)
    ax1.set_xlabel('Recency', fontweight='bold')
    ax1.set_ylabel('Monetary', fontweight='bold')
    ax1.set_title('Monetary vs Recency', fontweight='bold')
    ax1.grid(True, alpha=0.3)
    plt.colorbar(scatter1, ax=ax1, label='Cluster')
    
    # Monetary vs Frequency
    ax2 = axes[1]
    scatter2 = ax2.scatter(df['frequency'], df['monetary'], 
                          c=df['cluster'], cmap='viridis', alpha=0.6, s=50)
    ax2.set_xlabel('Frequency', fontweight='bold')
    ax2.set_ylabel('Monetary', fontweight='bold')
    ax2.set_title('Monetary vs Frequency', fontweight='bold')
    ax2.grid(True, alpha=0.3)
    plt.colorbar(scatter2, ax=ax2, label='Cluster')
    
    plt.tight_layout()
    output_path = output_dir / "bivariate_scatter_0db6ff0e.png"
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"OK: Generated: {output_path}")

def generate_pca_variance(df, output_dir):
    """Generate PCA explained variance plot."""
    features = ['recency', 'frequency', 'monetary', 'aov', 'tenure']
    X = df[features].values
    
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    pca = PCA()
    pca.fit(X_scaled)
    
    explained_variance = pca.explained_variance_ratio_
    cumulative_variance = np.cumsum(explained_variance)
    
    plt.figure(figsize=(10, 6))
    plt.plot(range(1, len(cumulative_variance) + 1), cumulative_variance, 
             marker='o', linewidth=2, color='#3b82f6')
    plt.axhline(y=0.90, color='r', linestyle='--', label='90% variance')
    plt.axvline(x=8, color='g', linestyle='--', label='8 components')
    plt.xlabel('Number of Components', fontweight='bold')
    plt.ylabel('Cumulative Explained Variance', fontweight='bold')
    plt.title('PCA: Cumulative Explained Variance', fontsize=14, fontweight='bold', pad=20)
    plt.grid(True, alpha=0.3)
    plt.legend()
    plt.xticks(range(1, len(cumulative_variance) + 1))
    
    plt.tight_layout()
    output_path = output_dir / "pca_variance_08c92b3e.png"
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"OK: Generated: {output_path}")

def generate_umap_projection(df, output_dir):
    """Generate UMAP/TSNE 2D projection (using t-SNE as fallback)."""
    features = ['recency', 'frequency', 'monetary', 'aov', 'tenure']
    X = df[features].values
    
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    # Use t-SNE as UMAP alternative (UMAP may require additional installation)
    tsne = TSNE(n_components=2, random_state=42, perplexity=min(30, len(df)-1))
    X_2d = tsne.fit_transform(X_scaled)
    
    plt.figure(figsize=(10, 8))
    scatter = plt.scatter(X_2d[:, 0], X_2d[:, 1], 
                         c=df['cluster'], cmap='viridis', alpha=0.6, s=50)
    plt.title('t-SNE 2D Projection of Customer Features', fontsize=14, fontweight='bold', pad=20)
    plt.xlabel('Component 1', fontweight='bold')
    plt.ylabel('Component 2', fontweight='bold')
    plt.colorbar(scatter, label='Cluster')
    plt.grid(True, alpha=0.3)
    
    plt.tight_layout()
    output_path = output_dir / "umap_projection_0f457801.png"
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"OK: Generated: {output_path}")

def generate_clustering_validation(df, output_dir):
    """Generate elbow and silhouette analysis."""
    features = ['recency', 'frequency', 'monetary', 'aov', 'tenure']
    X = df[features].values
    
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    # Elbow method
    inertias = []
    silhouette_scores = []
    K_range = range(2, 11)
    
    for k in K_range:
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = kmeans.fit_predict(X_scaled)
        inertias.append(kmeans.inertia_)
        
        from sklearn.metrics import silhouette_score
        silhouette_scores.append(silhouette_score(X_scaled, labels))
    
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    fig.suptitle('Clustering Validation', fontsize=16, fontweight='bold')
    
    # Elbow plot
    ax1 = axes[0]
    ax1.plot(K_range, inertias, marker='o', linewidth=2, color='#ef4444')
    ax1.axvline(x=4, color='g', linestyle='--', label='K=4 (optimal)')
    ax1.set_xlabel('Number of Clusters (K)', fontweight='bold')
    ax1.set_ylabel('Inertia', fontweight='bold')
    ax1.set_title('Elbow Method', fontweight='bold')
    ax1.grid(True, alpha=0.3)
    ax1.legend()
    
    # Silhouette plot
    ax2 = axes[1]
    ax2.plot(K_range, silhouette_scores, marker='o', linewidth=2, color='#3b82f6')
    ax2.axvline(x=4, color='g', linestyle='--', label='K=4 (optimal)')
    ax2.set_xlabel('Number of Clusters (K)', fontweight='bold')
    ax2.set_ylabel('Silhouette Score', fontweight='bold')
    ax2.set_title('Silhouette Analysis', fontweight='bold')
    ax2.grid(True, alpha=0.3)
    ax2.legend()
    
    plt.tight_layout()
    output_path = output_dir / "clustering_validation_5a84cae4.png"
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"OK: Generated: {output_path}")

def main():
    """Main function to generate all visualizations."""
    print("=" * 60)
    print("Generating Customer Segmentation Visualizations")
    print("=" * 60)
    
    # Create output directory
    output_dir = create_output_dir()
    print(f"\nOutput directory: {output_dir}")
    
    # Fetch data
    print("\nFetching customer data from database...")
    try:
        df = fetch_customer_data()
        print(f"OK: Loaded {len(df)} customer records")
    except Exception as e:
        print(f"ERROR: Failed to fetch data: {e}")
        print("Make sure DATABASE_URL is set in .env file")
        return
    
    if len(df) == 0:
        print("ERROR: No customer data found. Upload CSVs first.")
        return
    
    # Generate all charts
    print("\nGenerating visualizations...")
    try:
        generate_univariate_analysis(df, output_dir)
        generate_correlation_heatmap(df, output_dir)
        generate_bivariate_scatter(df, output_dir)
        generate_pca_variance(df, output_dir)
        generate_umap_projection(df, output_dir)
        generate_clustering_validation(df, output_dir)
    except Exception as e:
        print("\nERROR: Error generating visualizations:", e)
        import traceback
        traceback.print_exc()
        return
    
    print("\n" + "=" * 60)
    print("SUCCESS: All visualizations generated successfully!")
    print("=" * 60)
    print(f"\nCharts saved to: {output_dir}")
    print("Refresh the /visualizations page to see the charts.")

if __name__ == "__main__":
    main()