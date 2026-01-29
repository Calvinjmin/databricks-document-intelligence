# AI Functions — PDF Document Processor

A full-stack app that processes PDF documents using Databricks AI Functions. Upload a PDF and the pipeline will parse it, redact PII, and generate a structured summary.

## How It Works

1. **Upload** — PDF is uploaded to a Databricks Unity Catalog Volume
2. **Parse** — `ai_parse_document()` extracts text from the PDF
3. **Mask PII** — `ai_mask()` redacts names, emails, phone numbers, SSNs, etc.
4. **Summarize** — `ai_query()` (Meta Llama 3.3 70B) generates a structured JSON summary

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