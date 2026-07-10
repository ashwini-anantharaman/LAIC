from fastapi import APIRouter, File, HTTPException, UploadFile

from ..pdf_extract import extract_text_from_pdf
from ..rag import index_upload_text
from ..schemas import UploadResponse
from ..supabase_client import insert_upload

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

ALLOWED = {
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/markdown": "md",
}


@router.post("", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)) -> UploadResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    content_type = file.content_type or ""
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""

    if content_type not in ALLOWED and ext not in ("pdf", "txt", "md"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF, plain text (.txt), and markdown (.md) files are supported",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")

    try:
        if content_type == "application/pdf" or ext == "pdf":
            extracted = extract_text_from_pdf(data)
        else:
            extracted = data.decode("utf-8", errors="replace").strip()
            if not extracted:
                raise ValueError("File contains no readable text")
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))

    row = insert_upload(filename=file.filename, extracted_text=extracted, kind="context")
    if row is None:
        raise HTTPException(status_code=503, detail="Failed to store upload")

    # Index chunks for RAG retrieval (instant, no API call).
    index_upload_text(row["id"], extracted)

    return UploadResponse(
        uploadId=row["id"],
        filename=row["filename"],
        textLength=len(extracted),
    )
