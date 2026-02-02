#!/bin/bash

# Build script for Databricks App deployment

echo "Building frontend..."
cd frontend
npm install
npm run build
cd ..

echo "Build complete! Frontend static files are in frontend/dist/"
echo ""
echo "To deploy as a Databricks App:"
echo "1. Install Databricks CLI: pip install databricks-cli"
echo "2. Configure authentication: databricks configure --token"
echo "3. Deploy app: databricks apps deploy <app-name> --source-code-path ."

