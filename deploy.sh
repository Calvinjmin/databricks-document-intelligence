#!/bin/bash

# Deploy using Databricks Asset Bundles (DABs)

set -e

PROFILE=${1:-"e2"}

# Load environment variables from .env file
if [ -f .env ]; then
  echo "📋 Loading environment variables from .env..."
  export $(grep -v '^#' .env | xargs)
fi

# Verify required environment variables are set
if [ -z "$DATABRICKS_HOST" ] || [ -z "$DATABRICKS_TOKEN" ] || [ -z "$DATABRICKS_WAREHOUSE_ID" ] || [ -z "$UNITY_CATALOG_VOLUME_PATH" ]; then
  echo "❌ Error: Required environment variables not set."
  echo "   Please ensure .env file exists with:"
  echo "   - DATABRICKS_HOST"
  echo "   - DATABRICKS_TOKEN"
  echo "   - DATABRICKS_WAREHOUSE_ID"
  echo "   - UNITY_CATALOG_VOLUME_PATH"
  exit 1
fi

echo "🔨 Building frontend..."
cd frontend
npm install
npm run build
cd ..

echo "🚀 Deploying with Databricks Asset Bundles..."
databricks bundle deploy \
  --var="databricks_host=$DATABRICKS_HOST" \
  --var="databricks_token=$DATABRICKS_TOKEN" \
  --var="warehouse_id=$DATABRICKS_WAREHOUSE_ID" \
  --var="volume_path=$UNITY_CATALOG_VOLUME_PATH" \
  --profile "$PROFILE"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "To view logs:"
echo "  databricks apps logs cjm-ai-functions --profile $PROFILE"

