# Deploying to Databricks Apps

This app uses **Databricks Asset Bundles (DABs)** for deployment.

## Quick Deploy

```bash
./build.sh      # Build frontend
./deploy.sh e2  # Deploy to Databricks
```

## Prerequisites

- Databricks CLI installed: `pip install databricks-cli`
- Authenticated profile: `databricks auth login --profile e2`
- **Environment variables configured in `.env` file**

## Setup Environment Variables

Create a `.env` file in the project root (this file is gitignored):

```bash
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=dapi<your-token-here>
DATABRICKS_WAREHOUSE_ID=your-warehouse-id
UNITY_CATALOG_VOLUME_PATH=/Volumes/catalog/schema/volume
```

You can copy from the example:

```bash
cp .env.example .env
# Then edit .env with your actual values
```

## Configuration

The deployment script automatically reads from your `.env` file and passes the values to Databricks Asset Bundles. This keeps secrets out of git!

## Manual Commands

```bash
# Build frontend
cd frontend && npm run build && cd ..

# Validate bundle
databricks bundle validate --profile e2

# Deploy
databricks bundle deploy --profile e2

# View app status
databricks apps get cjm-ai-functions --profile e2

# View logs
databricks apps logs cjm-ai-functions --profile e2

# Delete app
databricks bundle destroy --profile e2
```

## Bundle Structure

```
databricks.yml          # Main bundle configuration
app.yaml               # App runtime configuration
server.py              # FastAPI backend
requirements.txt       # Python dependencies
frontend/dist/         # Built React app
static/                # Static assets
```

## Troubleshooting

**Error: Token issues**
- Make sure your profile is configured: `databricks auth login --profile e2`

**Error: Warehouse not found**
- Update `warehouse_id` in `databricks.yml`

**Error: Volume not accessible**
- Verify `volume_path` exists and you have access

**App won't start**
- Check logs: `databricks apps logs cjm-ai-functions --profile e2`
- Verify environment variables are set correctly

