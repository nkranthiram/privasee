"""
PrivaSee Backend API
FastAPI application for document de-identification.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import os
import json
import re
import logging
from datetime import datetime
import uuid
from pathlib import Path
from typing import Dict
from dotenv import load_dotenv

from app.models import (
    ProcessRequest, ProcessResponse,
    ApprovalRequest, ApprovalResponse,
    UploadResponse, ErrorResponse,
    Entity, HealthResponse,
    UserConfigSaveRequest,
    ScanRequest, BatchRequest, BatchDocumentResult, BatchResponse
)
from app.services.pdf_processor import PDFProcessor
from app.services.ocr_service import AzureOCRService
from app.services.claude_service import ClaudeVisionService
from app.services.mapping_manager import MappingManager
from app.services.masking_service import MaskingService

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="PrivaSee API",
    description="Intelligent document de-identification service",
    version="1.0.0"
)

# CORS configuration
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directory paths
BASE_DIR = Path(__file__).parent.parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
TEMP_IMAGE_DIR = DATA_DIR / "temp_images"
OUTPUT_DIR = DATA_DIR / "output"

# Strategy / config directories (inside backend/)
BACKEND_DIR = Path(__file__).parent.parent
SYSTEM_STRATEGIES_DIR = BACKEND_DIR / "data" / "system_strategies"
USER_CONFIGS_DIR = BACKEND_DIR / "data" / "user_configs"

# Ensure directories exist
for directory in [UPLOAD_DIR, TEMP_IMAGE_DIR, OUTPUT_DIR, SYSTEM_STRATEGIES_DIR, USER_CONFIGS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# Initialize services (default to None so variables always exist)
pdf_processor = None
ocr_service = None
claude_service = None
masking_service = None

try:
    pdf_processor = PDFProcessor(dpi=300)
    ocr_service = AzureOCRService(
        endpoint=os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT"),
        key=os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY")
    )
    claude_service = ClaudeVisionService(
        api_key=os.getenv("ANTHROPIC_API_KEY")
    )
    masking_service = MaskingService()

    logger.info("All services initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize services: {e}")

# Session storage (in production, use Redis or database)
sessions: Dict[str, dict] = {}


# Helper functions
def generate_session_id() -> str:
    """Generate unique session ID."""
    return str(uuid.uuid4())


def get_session(session_id: str) -> dict:
    """Get session data or raise error."""
    if session_id not in sessions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session not found: {session_id}"
        )
    return sessions[session_id]


# Routes

@app.get("/", response_model=dict)
async def root():
    """Root endpoint."""
    return {
        "service": "PrivaSee API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    services_status = {
        "pdf_processor": pdf_processor is not None,
        "ocr_service": ocr_service is not None,
        "claude_service": claude_service is not None,
        "masking_service": masking_service is not None
    }

    all_healthy = all(services_status.values())

    return HealthResponse(
        status="healthy" if all_healthy else "degraded",
        version="1.0.0",
        services=services_status
    )


@app.post("/api/upload", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload a PDF file for processing.

    Args:
        file: PDF file (single page)

    Returns:
        UploadResponse with session_id and preview information
    """
    try:
        logger.info(f"Received file upload: {file.filename}")

        # Validate file
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only PDF files are accepted"
            )

        # Check file size (10MB limit)
        max_size = int(os.getenv("MAX_FILE_SIZE_MB", "10")) * 1024 * 1024
        contents = await file.read()
        if len(contents) > max_size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File too large. Maximum size: {max_size // (1024*1024)}MB"
            )

        # Generate session ID
        session_id = generate_session_id()

        # Save PDF
        pdf_path = UPLOAD_DIR / f"{session_id}.pdf"
        with open(pdf_path, "wb") as f:
            f.write(contents)

        # Convert all pages to images (page_count derived from result)
        image_paths = pdf_processor.pdf_to_images_all(str(pdf_path), str(TEMP_IMAGE_DIR), session_id)
        page_count = len(image_paths)

        # Create session
        sessions[session_id] = {
            "session_id": session_id,
            "original_pdf_path": str(pdf_path),
            "image_paths": image_paths,
            "filename": file.filename,
            "file_size": len(contents),
            "page_count": page_count,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }

        logger.info(f"File uploaded successfully: {session_id} ({page_count} pages)")

        return UploadResponse(
            session_id=session_id,
            filename=file.filename,
            file_size=len(contents),
            page_count=page_count,
            preview_url=f"/api/files/temp_images/{session_id}_page1.png"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading file: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload file: {str(e)}"
        )


@app.post("/api/process", response_model=ProcessResponse)
async def process_document(request: ProcessRequest):
    """
    Process document to extract entities.

    Args:
        request: ProcessRequest with session_id and field_definitions

    Returns:
        ProcessResponse with identified entities
    """
    try:
        logger.info(f"Processing document for session: {request.session_id}")

        # Get session
        session = get_session(request.session_id)
        image_paths = session["image_paths"]

        # Single shared MappingManager so replacements stay consistent across pages
        mapping_manager = MappingManager()
        field_defs = [f.model_dump() for f in request.field_definitions]

        all_entities = []
        entity_counter = 0

        for page_num, image_path in enumerate(image_paths, 1):
            # Step 1: Run OCR for this page
            logger.info(f"Running OCR analysis for page {page_num}...")
            ocr_data = await ocr_service.analyze_document(image_path)

            # Step 2: Extract entities with Claude for this page
            logger.info(f"Extracting entities with Claude Vision for page {page_num}...")
            raw_entities = await claude_service.extract_entities(
                image_path,
                ocr_data,
                field_defs,
                page_number=page_num
            )

            # Step 3: Generate replacements using the shared MappingManager
            for entity_data in raw_entities:
                entity_type = entity_data["entity_type"]
                original_text = entity_data["original_text"]

                # Find matching field definition
                field_def = next(
                    (f for f in request.field_definitions if f.name == entity_type),
                    None
                )
                strategy = field_def.strategy.value if field_def else "Entity Label"

                # Generate replacement (consistent across pages via shared manager)
                replacement = mapping_manager.get_replacement(
                    entity_type,
                    original_text,
                    strategy
                )

                entity = Entity(
                    id=f"{request.session_id}_p{page_num}_{entity_counter}",
                    entity_type=entity_type,
                    original_text=original_text,
                    replacement_text=replacement,
                    bounding_box=entity_data["bounding_box"],
                    confidence=entity_data.get("confidence", 0.9),
                    approved=True,
                    page_number=page_num
                )
                all_entities.append(entity)
                entity_counter += 1

        entities = all_entities

        # Store in session
        session["entities"] = [e.model_dump() for e in entities]
        session["field_definitions"] = [f.model_dump() for f in request.field_definitions]
        session["updated_at"] = datetime.utcnow().isoformat()

        logger.info(f"Processing complete: {len(entities)} entities found across {len(image_paths)} pages")

        return ProcessResponse(
            session_id=request.session_id,
            entities=entities,
            total_entities=len(entities)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing document: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process document: {str(e)}"
        )


@app.post("/api/approve-and-mask", response_model=ApprovalResponse)
async def approve_and_mask(request: ApprovalRequest):
    """
    Generate masked PDF with approved entities.

    Args:
        request: ApprovalRequest with session_id and approved entity IDs

    Returns:
        ApprovalResponse with URLs to original and masked PDFs
    """
    try:
        logger.info(f"Generating masked PDF for session: {request.session_id}")

        # Get session
        session = get_session(request.session_id)
        image_paths = session["image_paths"]

        # Get entities
        all_entities = session.get("entities", [])
        if not all_entities:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No entities found in session. Process document first."
            )

        # Filter approved entities
        approved_entity_ids = set(request.approved_entity_ids)
        entities_to_mask = [
            e for e in all_entities
            if e["id"] in approved_entity_ids
        ]

        # Update replacement text if overrides provided
        if request.updated_entities:
            entity_updates = {e.id: e for e in request.updated_entities}
            for entity in entities_to_mask:
                if entity["id"] in entity_updates:
                    updated = entity_updates[entity["id"]]
                    entity["replacement_text"] = updated.replacement_text

        if not entities_to_mask:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No approved entities to mask"
            )

        logger.info(f"Masking {len(entities_to_mask)} entities across {len(image_paths)} pages")

        # Mask each page separately, then combine into one PDF
        masked_image_paths = []
        for page_num, image_path in enumerate(image_paths, 1):
            page_entities = [e for e in entities_to_mask if e.get("page_number", 1) == page_num]
            masked_image_path = TEMP_IMAGE_DIR / f"{request.session_id}_masked_page{page_num}.png"
            masking_service.apply_masks(
                image_path,
                page_entities,
                str(masked_image_path)
            )
            masked_image_paths.append(str(masked_image_path))

        # Combine all masked page images into a single multi-page PDF
        masked_pdf_path = OUTPUT_DIR / f"{request.session_id}_masked.pdf"
        pdf_processor.images_to_pdf(masked_image_paths, str(masked_pdf_path))

        # Update session
        session["masked_image_paths"] = masked_image_paths
        session["masked_pdf_path"] = str(masked_pdf_path)
        session["updated_at"] = datetime.utcnow().isoformat()

        logger.info(f"Masked PDF generated successfully: {masked_pdf_path}")

        return ApprovalResponse(
            session_id=request.session_id,
            original_pdf_url=f"/api/files/uploads/{request.session_id}.pdf",
            masked_pdf_url=f"/api/files/output/{request.session_id}_masked.pdf",
            masked_image_url=f"/api/files/temp_images/{request.session_id}_masked_page1.png",
            entities_masked=len(entities_to_mask)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating masked PDF: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate masked PDF: {str(e)}"
        )


@app.get("/api/files/{folder}/{filename}")
async def serve_file(folder: str, filename: str):
    """
    Serve files (PDFs, images) for download/preview.

    Args:
        folder: Folder name (uploads, temp_images, output)
        filename: File name

    Returns:
        File response
    """
    try:
        # Validate folder
        allowed_folders = ["uploads", "temp_images", "output"]
        if folder not in allowed_folders:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid folder. Allowed: {allowed_folders}"
            )

        # Build file path
        file_path = DATA_DIR / folder / filename

        # Check if file exists
        if not file_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"File not found: {filename}"
            )

        # Determine media type
        suffix = file_path.suffix.lower()
        media_types = {
            ".pdf": "application/pdf",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg"
        }
        media_type = media_types.get(suffix, "application/octet-stream")

        return FileResponse(
            path=file_path,
            media_type=media_type,
            filename=filename,
            content_disposition_type="inline"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving file: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to serve file: {str(e)}"
        )


@app.get("/api/sessions/{session_id}")
async def get_session_info(session_id: str):
    """
    Get information about a session.

    Args:
        session_id: Session identifier

    Returns:
        Session information
    """
    try:
        session = get_session(session_id)

        # Remove sensitive data
        safe_session = {
            "session_id": session["session_id"],
            "filename": session["filename"],
            "file_size": session["file_size"],
            "created_at": session["created_at"],
            "updated_at": session["updated_at"],
            "has_entities": "entities" in session,
            "entity_count": len(session.get("entities", [])),
            "has_masked_pdf": "masked_pdf_path" in session
        }

        return safe_session

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session info: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get session info: {str(e)}"
        )


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """
    Delete a session and its associated files.

    Args:
        session_id: Session identifier

    Returns:
        Success message
    """
    try:
        session = get_session(session_id)

        # Collect all files to delete
        files_to_delete = [
            session.get("original_pdf_path"),
            session.get("masked_pdf_path"),
        ]
        # Add per-page source images
        for p in session.get("image_paths", []):
            files_to_delete.append(p)
        # Add per-page masked images
        for p in session.get("masked_image_paths", []):
            files_to_delete.append(p)

        for file_path in files_to_delete:
            if file_path and os.path.exists(file_path):
                os.remove(file_path)
                logger.info(f"Deleted file: {file_path}")

        # Remove from sessions
        del sessions[session_id]

        logger.info(f"Session deleted: {session_id}")

        return {"message": "Session deleted successfully", "session_id": session_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting session: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete session: {str(e)}"
        )


# ─── Batch Processing Helpers ────────────────────────────────────────────────

async def verify_masking_quality(masked_image_paths: list, entities: list) -> int:
    """
    OCR the masked page images and count how many original entity texts
    are no longer detectable — i.e. were successfully masked.

    Returns the number of entities whose original text is absent from the
    masked OCR output.
    """
    full_masked_text = ""
    for img_path in masked_image_paths:
        try:
            ocr_data = await ocr_service.analyze_document(img_path)
            full_masked_text += " " + ocr_data.get("text", "").lower()
        except Exception as e:
            logger.warning(f"Verification OCR failed for {img_path}: {e}")

    masked_count = 0
    for entity in entities:
        original = entity["original_text"].strip().lower()
        if not original or original not in full_masked_text:
            masked_count += 1

    return masked_count


async def process_single_batch_document(
    pdf_path: Path,
    field_definitions,
    field_defs: list,
) -> BatchDocumentResult:
    """
    Run the full pipeline (OCR → Claude → Mask → Verify → Save) for one PDF.
    Masked output is saved as masked_{filename} in the same folder.
    Each document gets its own fresh MappingManager — no cross-doc consistency.
    """
    filename = pdf_path.name
    masked_filename = f"masked_{filename}"
    session_id = str(uuid.uuid4())
    image_paths: list = []
    masked_image_paths: list = []

    try:
        # 1. Convert PDF pages → images
        image_paths = pdf_processor.pdf_to_images_all(
            str(pdf_path), str(TEMP_IMAGE_DIR), session_id
        )

        # 2. OCR + Claude per page
        mapping_manager = MappingManager()
        all_entities = []
        entity_counter = 0

        for page_num, image_path in enumerate(image_paths, 1):
            ocr_data = await ocr_service.analyze_document(image_path)
            raw_entities = await claude_service.extract_entities(
                image_path, ocr_data, field_defs, page_number=page_num
            )

            for entity_data in raw_entities:
                entity_type = entity_data["entity_type"]
                original_text = entity_data["original_text"]

                field_def = next(
                    (f for f in field_definitions if f.name == entity_type), None
                )
                strategy = field_def.strategy.value if field_def else "Entity Label"

                replacement = mapping_manager.get_replacement(
                    entity_type, original_text, strategy
                )

                all_entities.append({
                    "id": f"{session_id}_p{page_num}_{entity_counter}",
                    "entity_type": entity_type,
                    "original_text": original_text,
                    "replacement_text": replacement,
                    "bounding_box": entity_data["bounding_box"],
                    "confidence": entity_data.get("confidence", 0.9),
                    "page_number": page_num,
                })
                entity_counter += 1

        entities_to_mask = len(all_entities)

        # 3. If nothing found, still produce a clean masked copy
        if entities_to_mask == 0:
            masked_pdf_path = pdf_path.parent / masked_filename
            pdf_processor.images_to_pdf(image_paths, str(masked_pdf_path))
            return BatchDocumentResult(
                filename=filename,
                masked_filename=masked_filename,
                status="success",
                entities_to_mask=0,
                entities_masked=0,
                score=100.0,
            )

        # 4. Apply masks per page
        for page_num, image_path in enumerate(image_paths, 1):
            page_entities = [
                e for e in all_entities if e.get("page_number", 1) == page_num
            ]
            masked_img = str(
                TEMP_IMAGE_DIR / f"{session_id}_masked_page{page_num}.png"
            )
            masking_service.apply_masks(image_path, page_entities, masked_img)
            masked_image_paths.append(masked_img)

        # 5. Combine masked pages → PDF and save alongside originals
        masked_pdf_path = pdf_path.parent / masked_filename
        pdf_processor.images_to_pdf(masked_image_paths, str(masked_pdf_path))

        # 6. Verify: OCR the masked images, count entities no longer visible
        entities_masked = await verify_masking_quality(masked_image_paths, all_entities)
        score = round((entities_masked / entities_to_mask) * 100, 1)

        logger.info(
            f"Batch doc '{filename}': {entities_masked}/{entities_to_mask} masked "
            f"({score}%)"
        )

        return BatchDocumentResult(
            filename=filename,
            masked_filename=masked_filename,
            status="success",
            entities_to_mask=entities_to_mask,
            entities_masked=entities_masked,
            score=score,
        )

    except Exception as e:
        logger.error(f"Batch error processing '{filename}': {e}")
        return BatchDocumentResult(
            filename=filename,
            masked_filename=masked_filename,
            status="error",
            entities_to_mask=0,
            entities_masked=0,
            score=0.0,
            error=str(e),
        )

    finally:
        # Always clean up temp images for this session
        for img_path in image_paths + masked_image_paths:
            try:
                if os.path.exists(img_path):
                    os.remove(img_path)
            except Exception:
                pass


# ─── Batch Endpoints ──────────────────────────────────────────────────────────

@app.post("/api/batch/scan")
async def scan_batch_folder(request: ScanRequest):
    """
    Validate a folder path and list eligible PDFs (excluding masked_* files).
    Uses POST + JSON body to avoid URL encoding issues with path separators.
    """
    try:
        folder = Path(request.folder_path.strip())

        if not folder.exists():
            raise HTTPException(
                status_code=400,
                detail=f"Folder not found: {folder}"
            )
        if not folder.is_dir():
            raise HTTPException(
                status_code=400,
                detail=f"Path is not a directory: {folder}"
            )

        pdf_files = sorted([
            f.name for f in folder.iterdir()
            if f.suffix.lower() == ".pdf" and not f.name.startswith("masked_")
        ])

        return {
            "folder_path": str(folder),
            "pdf_files": pdf_files,
            "count": len(pdf_files),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error scanning folder: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to scan folder: {str(e)}")


@app.post("/api/batch", response_model=BatchResponse)
async def process_batch(request: BatchRequest):
    """
    Process every PDF in a local folder through the full de-identification
    pipeline (OCR → Claude → Mask → Verify) and save masked_*.pdf files
    alongside the originals.

    Args:
        request: folder_path and field_definitions

    Returns:
        Per-document results and an overall batch quality score
    """
    try:
        folder = Path(request.folder_path)

        if not folder.exists() or not folder.is_dir():
            raise HTTPException(
                status_code=400,
                detail=f"Folder not found: {request.folder_path}"
            )

        pdf_files = sorted([
            f for f in folder.iterdir()
            if f.suffix.lower() == ".pdf" and not f.name.startswith("masked_")
        ])

        if not pdf_files:
            raise HTTPException(
                status_code=400,
                detail="No PDF files found in the folder (masked_*.pdf files are excluded)"
            )

        logger.info(
            f"Batch processing {len(pdf_files)} PDFs from '{folder}' "
            f"with {len(request.field_definitions)} field(s)"
        )

        field_defs = [f.model_dump() for f in request.field_definitions]
        results = []

        for pdf_path in pdf_files:
            logger.info(f"Processing batch document: {pdf_path.name}")
            result = await process_single_batch_document(
                pdf_path, request.field_definitions, field_defs
            )
            results.append(result)

        # Aggregate score
        total_to_mask = sum(r.entities_to_mask for r in results)
        total_masked = sum(r.entities_masked for r in results)
        batch_score = (
            round((total_masked / total_to_mask) * 100, 1)
            if total_to_mask > 0
            else 100.0
        )
        successful = sum(1 for r in results if r.status == "success")

        logger.info(
            f"Batch complete: {successful}/{len(results)} docs OK, "
            f"batch score {batch_score}%"
        )

        return BatchResponse(
            output_folder=str(folder),
            total_documents=len(results),
            successful_documents=successful,
            batch_score=batch_score,
            results=results,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch processing error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Batch processing failed: {str(e)}"
        )


# ─── Strategy & Config Endpoints ─────────────────────────────────────────────

@app.get("/api/strategies/system")
async def list_system_templates():
    """
    List all available system strategy templates.

    Returns:
        List of template summaries (name, description, version, field_count)
    """
    try:
        templates = []
        for json_file in sorted(SYSTEM_STRATEGIES_DIR.glob("*.json")):
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            templates.append({
                "template_name": data.get("template_name", json_file.stem),
                "description": data.get("description", ""),
                "version": data.get("version", "1.0"),
                "field_count": len(data.get("fields", []))
            })
        return {"templates": templates}
    except Exception as e:
        logger.error(f"Error listing system templates: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list templates: {str(e)}")


@app.get("/api/strategies/system/{template_name}")
async def get_system_template(template_name: str):
    """
    Get a specific system strategy template by name.

    Args:
        template_name: Name of the template (as stored in the JSON file)

    Returns:
        Full template with fields (source='system' injected into each field)
    """
    try:
        for json_file in SYSTEM_STRATEGIES_DIR.glob("*.json"):
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("template_name") == template_name:
                # Inject source='system' into each field
                for field in data.get("fields", []):
                    field["source"] = "system"
                return data
        raise HTTPException(status_code=404, detail=f"Template not found: {template_name}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading system template '{template_name}': {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load template: {str(e)}")


@app.post("/api/configs")
async def save_user_config(request: UserConfigSaveRequest):
    """
    Save a user configuration to the user_configs folder.

    Args:
        request: Config name and list of field definitions

    Returns:
        Confirmation with saved filename
    """
    try:
        # Sanitise to a safe filename (alphanumeric + hyphens/underscores)
        safe_stem = re.sub(r"[^\w\-]", "_", request.config_name.strip())
        filename = f"{safe_stem}.json"
        file_path = USER_CONFIGS_DIR / filename

        config_data = {
            "config_name": request.config_name,
            "created_at": datetime.utcnow().isoformat(),
            "fields": [f.model_dump() for f in request.fields]
        }

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(config_data, f, indent=2)

        logger.info(f"User config saved: {filename}")
        return {"message": "Configuration saved", "filename": filename, "config_name": request.config_name}
    except Exception as e:
        logger.error(f"Error saving user config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save configuration: {str(e)}")


@app.get("/api/configs")
async def list_user_configs():
    """
    List all saved user configurations.

    Returns:
        List of config summaries (name, filename, field_count, created_at)
    """
    try:
        configs = []
        for json_file in sorted(USER_CONFIGS_DIR.glob("*.json")):
            if json_file.name == ".gitkeep":
                continue
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            configs.append({
                "config_name": data.get("config_name", json_file.stem),
                "filename": json_file.name,
                "field_count": len(data.get("fields", [])),
                "created_at": data.get("created_at", "")
            })
        return {"configs": configs}
    except Exception as e:
        logger.error(f"Error listing user configs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list configurations: {str(e)}")


@app.get("/api/configs/{config_name}")
async def get_user_config(config_name: str):
    """
    Load a specific saved user configuration.

    Args:
        config_name: Name of the saved configuration

    Returns:
        Full configuration with fields
    """
    try:
        # Try exact filename first
        safe_stem = re.sub(r"[^\w\-]", "_", config_name.strip())
        file_path = USER_CONFIGS_DIR / f"{safe_stem}.json"

        if file_path.exists():
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)

        # Fall back: search by config_name field inside each file
        for json_file in USER_CONFIGS_DIR.glob("*.json"):
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("config_name") == config_name:
                return data

        raise HTTPException(status_code=404, detail=f"Configuration not found: {config_name}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading user config '{config_name}': {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load configuration: {str(e)}")


# Exception handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Handle HTTP exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "status_code": exc.status_code}
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Handle general exceptions."""
    logger.error(f"Unhandled exception: {str(exc)}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "Internal server error", "detail": str(exc)}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
