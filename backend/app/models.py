"""
Pydantic Models
Data models for API requests and responses.
"""

from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from enum import Enum


class ReplacementStrategy(str, Enum):
    """Strategy for replacing identified entities."""
    FAKE_DATA = "Fake Data"
    BLACK_OUT = "Black Out"
    ENTITY_LABEL = "Entity Label"


class FieldDefinition(BaseModel):
    """Definition of a field to identify and redact."""
    name: str = Field(..., description="Name of the field (e.g., 'Full Name')")
    description: str = Field(..., description="Description to help identify the field")
    strategy: ReplacementStrategy = Field(..., description="How to replace this field")
    source: Optional[str] = Field(default="custom", description="Origin of the field: 'system' or 'custom'")

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Field name cannot be empty')
        return v.strip()

    @field_validator('description')
    @classmethod
    def description_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Field description cannot be empty')
        return v.strip()


class BoundingBox(BaseModel):
    """Bounding box coordinates."""
    x: float = Field(..., ge=0, description="X coordinate (left)")
    y: float = Field(..., ge=0, description="Y coordinate (top)")
    width: float = Field(..., ge=0, description="Width")
    height: float = Field(..., ge=0, description="Height")

    def to_list(self) -> List[float]:
        """Convert to list format [x, y, width, height]."""
        return [self.x, self.y, self.width, self.height]

    @classmethod
    def from_list(cls, bbox: List[float]) -> 'BoundingBox':
        """Create from list format [x, y, width, height]."""
        if len(bbox) != 4:
            raise ValueError("Bounding box must have exactly 4 values")
        return cls(x=bbox[0], y=bbox[1], width=bbox[2], height=bbox[3])


class Entity(BaseModel):
    """Identified entity in document."""
    id: str = Field(..., description="Unique identifier for this entity")
    entity_type: str = Field(..., description="Type of entity (field name)")
    original_text: str = Field(..., description="Original text found in document")
    replacement_text: str = Field(..., description="Text to replace it with")
    bounding_box: List[float] = Field(..., description="Bounding box [x, y, width, height]")
    confidence: float = Field(default=0.9, ge=0, le=1, description="Confidence score")
    approved: bool = Field(default=True, description="Whether entity is approved for masking")
    page_number: int = Field(default=1, ge=1, description="Page number where entity appears")

    @field_validator('bounding_box')
    @classmethod
    def validate_bbox(cls, v):
        if len(v) != 4:
            raise ValueError('Bounding box must have exactly 4 values [x, y, width, height]')
        return v


class UploadResponse(BaseModel):
    """Response after uploading a PDF."""
    session_id: str = Field(..., description="Unique session identifier")
    filename: str = Field(..., description="Original filename")
    file_size: int = Field(..., description="File size in bytes")
    page_count: int = Field(default=1, description="Number of pages in the PDF")
    preview_url: Optional[str] = Field(None, description="URL to preview image (first page)")
    message: str = Field(default="File uploaded successfully")


class ProcessRequest(BaseModel):
    """Request to process a document."""
    session_id: str = Field(..., description="Session identifier from upload")
    field_definitions: List[FieldDefinition] = Field(
        ...,
        min_length=1,
        description="List of fields to identify and redact"
    )

    @field_validator('field_definitions')
    @classmethod
    def validate_fields(cls, v):
        if not v:
            raise ValueError('At least one field definition is required')
        # Check for duplicate field names
        names = [f.name for f in v]
        if len(names) != len(set(names)):
            raise ValueError('Field names must be unique')
        return v


class ProcessResponse(BaseModel):
    """Response after processing a document."""
    session_id: str = Field(..., description="Session identifier")
    entities: List[Entity] = Field(..., description="Identified entities")
    total_entities: int = Field(..., description="Total number of entities found")
    message: str = Field(default="Document processed successfully")


class ApprovalRequest(BaseModel):
    """Request to approve entities and generate masked PDF."""
    session_id: str = Field(..., description="Session identifier")
    approved_entity_ids: List[str] = Field(
        ...,
        description="List of entity IDs to mask (only these will be masked)"
    )
    updated_entities: Optional[List[Entity]] = Field(
        None,
        description="Optional list of entities with updated replacement text"
    )


class ApprovalResponse(BaseModel):
    """Response after generating masked PDF."""
    session_id: str = Field(..., description="Session identifier")
    original_pdf_url: str = Field(..., description="URL to original PDF")
    masked_pdf_url: str = Field(..., description="URL to masked PDF")
    masked_image_url: Optional[str] = Field(None, description="URL to masked image preview")
    entities_masked: int = Field(..., description="Number of entities that were masked")
    message: str = Field(default="Masked PDF generated successfully")


class ErrorResponse(BaseModel):
    """Error response."""
    error: str = Field(..., description="Error message")
    detail: Optional[str] = Field(None, description="Detailed error information")
    session_id: Optional[str] = Field(None, description="Session identifier if applicable")


class OCRData(BaseModel):
    """OCR data from Azure Document Intelligence."""
    text: str = Field(..., description="Full extracted text")
    words: List[dict] = Field(default_factory=list, description="Word-level data with bounding boxes")
    lines: List[dict] = Field(default_factory=list, description="Line-level data")
    pages: List[dict] = Field(default_factory=list, description="Page-level information")


class SessionData(BaseModel):
    """Session data stored in memory."""
    session_id: str
    original_pdf_path: str
    image_path: str
    filename: str
    field_definitions: Optional[List[FieldDefinition]] = None
    ocr_data: Optional[dict] = None
    entities: Optional[List[Entity]] = None
    masked_image_path: Optional[str] = None
    masked_pdf_path: Optional[str] = None
    created_at: str
    updated_at: str


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = Field(default="healthy")
    version: str = Field(default="1.0.0")
    services: dict = Field(
        default_factory=dict,
        description="Status of dependent services"
    )


class TemplateInfo(BaseModel):
    """Summary info about a system strategy template."""
    template_name: str
    description: str
    version: str
    field_count: int


class SystemTemplate(BaseModel):
    """Full system strategy template with fields."""
    template_name: str
    description: str
    version: str
    fields: List[FieldDefinition]


class ScanRequest(BaseModel):
    """Request to scan a folder for eligible PDF files."""
    folder_path: str = Field(..., description="Absolute path to the folder to scan")


class BatchRequest(BaseModel):
    """Request to process a batch of PDFs from a local folder."""
    folder_path: str = Field(..., description="Absolute path to the folder containing PDFs")
    field_definitions: List[FieldDefinition] = Field(..., min_length=1)

    @field_validator('folder_path')
    @classmethod
    def path_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Folder path cannot be empty')
        return v.strip()


class BatchDocumentResult(BaseModel):
    """Per-document result from batch processing."""
    filename: str
    masked_filename: str
    status: str = Field(..., description="'success' or 'error'")
    entities_to_mask: int = 0
    entities_masked: int = 0
    score: float = 0.0
    error: Optional[str] = None


class BatchResponse(BaseModel):
    """Response after processing a full batch."""
    output_folder: str
    total_documents: int
    successful_documents: int
    batch_score: float
    results: List[BatchDocumentResult]


class UserConfigSaveRequest(BaseModel):
    """Request to save a user configuration."""
    config_name: str = Field(..., description="Name for the saved configuration")
    fields: List[FieldDefinition] = Field(..., description="Field definitions to save")

    @field_validator('config_name')
    @classmethod
    def name_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Config name cannot be empty')
        return v.strip()


class UserConfigInfo(BaseModel):
    """Summary info about a saved user configuration."""
    config_name: str
    filename: str
    field_count: int
    created_at: str
