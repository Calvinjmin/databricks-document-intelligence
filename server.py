import os
import logging
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_connection():
    return databricks_sql.connect(
        server_hostname=os.environ["DATABRICKS_HOST"].replace("https://", ""),
        http_path=f"/sql/1.0/warehouses/{os.environ['DATABRICKS_WAREHOUSE_ID']}",
        access_token=os.environ["DATABRICKS_TOKEN"],
    )


def upload_to_volume(file: UploadFile) -> str:
    volume_path = os.environ["UNITY_CATALOG_VOLUME_PATH"]
    file_path = f"{volume_path}/{file.filename}"
    w = WorkspaceClient()
    w.files.upload(file_path, file.file.read(), overwrite=True)
    return file_path


def run_query(conn, query: str, column: str) -> str:
    with conn.cursor() as cursor:
        cursor.execute(query)
        row = cursor.fetchone()
        return getattr(row, column, "") if row else ""


@app.post("/api/process")
async def process_pdf(file: UploadFile):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted.")

    logger.info("Received file: %s (%.1f KB)", file.filename, file.size / 1024 if file.size else 0)

    try:
        conn = get_connection()

        # 1 - Upload to Volume
        logger.info("Uploading to Unity Catalog Volume...")
        file_path = upload_to_volume(file)
        logger.info("Upload complete: %s", file_path)

        # 2 - Parse
        logger.info("Parsing document with ai_parse_document()...")
        parsed = run_query(
            conn,
            f"SELECT ai_parse_document(content) AS parsed FROM read_files('{file_path}', format => 'binaryFile')",
            "parsed",
        )
        logger.info("Parse complete: %d characters extracted", len(parsed))

        # 3 - Mask PII
        logger.info("Masking PII with ai_mask()...")
        escaped = parsed.replace("'", "\\'")
        masked = run_query(
            conn,
            f"SELECT ai_mask('{escaped}', array('name', 'email', 'phone', 'ssn', 'address', 'date_of_birth', 'credit_card')) AS masked",
            "masked",
        )
        logger.info("Masking complete")

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
        logger.info("Summary complete. Processing finished for %s", file.filename)

        conn.close()

        return {
            "file": file.filename,
            "parsed_length": len(parsed),
            "parsed_text": parsed,
            "masked_text": masked,
            "summary": summary,
        }

    except Exception as e:
        logger.exception("Error processing %s", file.filename)
        raise HTTPException(500, str(e))
