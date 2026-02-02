# AI Functions — PDF Document Processor

A full-stack app that processes PDF documents using Databricks AI Functions. Upload a PDF and the pipeline will parse it, redact PII, generate a structured summary, and provide AI-powered next steps.

## How It Works

1. **Upload** — PDF is uploaded to a Databricks Unity Catalog Volume
2. **Parse** — `ai_parse_document()` extracts text from the PDF
3. **Mask PII** — `ai_mask()` redacts 20 critical PII types including:
   - Personal: names, emails, phone, SSN, address, DOB
   - Financial: credit cards, bank accounts, routing numbers
   - Insurance: policy numbers, claim IDs, member IDs, group numbers
   - Healthcare: medical records, patient IDs, provider IDs, NPI, diagnoses, prescriptions
   - Government: driver's licenses
4. **Summarize** — `ai_query()` (Meta Llama 3.3 70B) generates a structured JSON summary
5. **Next Steps** — `ai_query()` analyzes the summary and provides actionable recommendations

## Features

- 📄 **PDF Viewer** - View the original document alongside processed results
- 🎯 **AI-Generated Action Items** - Get prioritized next steps with suggested deadlines
- 🔒 **PII Masking** - Automatic redaction with side-by-side comparison
- ⚡ **Performance Metrics** - Track parsing and masking execution times
- 🎨 **Modern UI** - Beautiful dark-themed interface with interactive tabs

## Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- A Databricks workspace with a SQL Warehouse and Unity Catalog Volume

### Environment Variables

Create a `.env` file in the project root:

```
DATABRICKS_HOST=https://<your-workspace>.cloud.databricks.com
DATABRICKS_TOKEN=<your-access-token>
DATABRICKS_WAREHOUSE_ID=<your-warehouse-id>
UNITY_CATALOG_VOLUME_PATH=<your-volume-path>
```

### Install Dependencies

```bash
pip install -r requirements.txt
cd frontend && npm install
```

### Run

```bash
./start.sh
```

## Deploying as a Databricks App

```bash
./build.sh      # Build frontend
./deploy.sh e2  # Deploy to Databricks
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.