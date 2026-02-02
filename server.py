import os
import logging
import time
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from databricks import sql as databricks_sql
from databricks.sdk import WorkspaceClient

load_dotenv(override=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

logger.info("DATABRICKS_HOST=%s", os.environ.get("DATABRICKS_HOST", "<not set>"))
logger.info("DATABRICKS_TOKEN=%s...", os.environ.get("DATABRICKS_TOKEN", "<not set>")[:10])
logger.info("DATABRICKS_WAREHOUSE_ID=%s", os.environ.get("DATABRICKS_WAREHOUSE_ID", "<not set>"))
logger.info("UNITY_CATALOG_VOLUME_PATH=%s", os.environ.get("UNITY_CATALOG_VOLUME_PATH", "<not set>"))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "*"],  # Allow all origins for Databricks App
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_connection():
    return databricks_sql.connect(
        server_hostname=os.environ["DATABRICKS_HOST"].replace("https://", ""),
        http_path=f"/sql/1.0/warehouses/{os.environ['DATABRICKS_WAREHOUSE_ID']}",
        access_token=os.environ["DATABRICKS_TOKEN"],
    )


def upload_to_volume(file_content: bytes, filename: str) -> str:
    volume_path = os.environ["UNITY_CATALOG_VOLUME_PATH"]
    file_path = f"{volume_path}/{filename}"
    w = WorkspaceClient()
    w.files.upload(file_path, file_content, overwrite=True)
    return file_path


def run_query(conn, query: str, column: str) -> str:
    with conn.cursor() as cursor:
        cursor.execute(query)
        row = cursor.fetchone()
        return getattr(row, column, "") if row else ""


# Mount static files for production
if os.path.exists("frontend/dist"):
    app.mount("/assets", StaticFiles(directory="frontend/dist/assets"), name="assets")
    
    @app.get("/dbx_logo.png")
    async def serve_logo():
        return FileResponse("frontend/dist/dbx_logo.png")
    
    @app.get("/")
    async def serve_frontend():
        return FileResponse("frontend/dist/index.html")


@app.post("/api/process")
async def process_pdf(file: UploadFile):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted.")

    logger.info("Received file: %s (%.1f KB)", file.filename, file.size / 1024 if file.size else 0)

    # Read file content once for both upload and base64 encoding
    file_content = await file.read()
    await file.seek(0)
    
    # Convert to base64 for frontend display
    import base64
    pdf_base64 = base64.b64encode(file_content).decode('utf-8')

    try:
        conn = get_connection()

        # 1 - Upload to Volume
        logger.info("Uploading to Unity Catalog Volume...")
        file_path = upload_to_volume(file_content, file.filename)
        logger.info("Upload complete: %s", file_path)

        # 2 - Parse
        logger.info("Parsing document with ai_parse_document()...")
        parse_start = time.time()
        parsed = run_query(
            conn,
            f"SELECT ai_parse_document(content) AS parsed FROM read_files('{file_path}', format => 'binaryFile')",
            "parsed",
        )
        parse_time = time.time() - parse_start
        logger.info("Parse complete: %d characters extracted in %.2f seconds", len(parsed), parse_time)

        # 3 - Mask PII
        logger.info("Masking PII with ai_mask()...")
        mask_start = time.time()
        escaped = parsed.replace("'", "\\'")
        
        # Comprehensive PII masking for insurance/healthcare documents
        # Note: ai_mask() supports maximum 20 fields
        pii_fields = [
            # Personal identifiers (critical)
            'name', 'email', 'phone', 'ssn', 'address', 'date_of_birth',
            # Financial (important)
            'credit_card', 'bank_account', 'routing_number',
            # Insurance-specific (critical for claims)
            'policy_number', 'claim_number', 'member_id', 'group_number',
            # Healthcare (critical for medical documents)
            'medical_record_number', 'patient_id', 'provider_id', 'npi',
            'diagnosis', 'prescription',
            # Government ID (important)
            'drivers_license'
        ]
        
        # Build the array string for SQL
        fields_array = ', '.join([f"'{field}'" for field in pii_fields])
        
        masked = run_query(
            conn,
            f"SELECT ai_mask('{escaped}', array({fields_array})) AS masked",
            "masked",
        )
        mask_time = time.time() - mask_start
        logger.info("Masking complete in %.2f seconds (%d PII types)", mask_time, len(pii_fields))

        # 4 - Summarize
        logger.info("Generating summary with ai_query()...")
        masked_escaped = masked.replace("'", "\\'")
        prompt = (
            "Summarize the following document into a structured JSON object with keys: "
            "title, date, parties, key_terms, and summary. "
            "All personally identifiable information has already been redacted. "
            "Return ONLY valid JSON.\\n\\n"
            f"{masked_escaped}"
        )
        summary = run_query(
            conn,
            f"SELECT ai_query('databricks-meta-llama-3-3-70b-instruct', '{prompt}') AS result",
            "result",
        )
        logger.info("Summary complete")

        # 5 - Generate Next Steps
        logger.info("Generating actionable next steps with ai_query()...")
        next_steps_prompt = (
            "Based on this document summary, provide 3-5 specific, actionable next steps. "
            "Return a JSON object with a 'next_steps' array where each item has 'action', 'priority' (high/medium/low), and 'deadline' (suggested timeframe). "
            "Return ONLY valid JSON.\\n\\n"
            f"{summary}"
        )
        next_steps_escaped = next_steps_prompt.replace("'", "\\'")
        next_steps = run_query(
            conn,
            f"SELECT ai_query('databricks-meta-llama-3-3-70b-instruct', '{next_steps_escaped}') AS result",
            "result",
        )
        logger.info("Next steps generated. Processing finished for %s", file.filename)

        conn.close()

        return {
            "file": file.filename,
            "parsed_length": len(parsed),
            "parsed_text": parsed,
            "masked_text": masked,
            "summary": summary,
            "next_steps": next_steps,
            "parse_time": round(parse_time, 2),
            "mask_time": round(mask_time, 2),
            "pdf_data": pdf_base64,
        }

    except Exception as e:
        logger.exception("Error processing %s", file.filename)
        raise HTTPException(500, str(e))
