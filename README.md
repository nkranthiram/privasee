# PrivaSee - Document De-identification Tool

PrivaSee is a local full-stack application for intelligent document de-identification. It leverages AI (Azure Document Intelligence + Claude Vision) to identify sensitive information in single-page PDFs and replaces it with consistent, realistic fake data or redactions.

## Features

- **AI-Powered Entity Extraction**: Uses Azure Document Intelligence for OCR and Claude Vision for intelligent entity recognition
- **Typo Tolerance**: Handles variations and typos in entity detection (e.g., "Kranti" vs "Kranthi")
- **Consistent Replacement**: Ensures the same entity always maps to the same replacement throughout the document
- **Multiple Strategies**: Choose between fake data generation, complete redaction, or entity labels
- **Visual Comparison**: Side-by-side view of original and masked PDFs
- **Privacy First**: All processing happens locally with secure API calls

## Architecture

```
privasee/
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── main.py      # API endpoints
│   │   ├── models.py    # Pydantic models
│   │   └── services/    # Core services
│   │       ├── pdf_processor.py
│   │       ├── ocr_service.py
│   │       ├── claude_service.py
│   │       ├── mapping_manager.py
│   │       └── masking_service.py
│   └── requirements.txt
├── frontend/            # React + Vite frontend
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── services/    # API client
│   │   └── App.jsx      # Main app
│   └── package.json
└── data/               # File storage
    ├── uploads/        # Original PDFs
    ├── temp_images/    # Intermediate images
    └── output/         # Masked PDFs
```

## Prerequisites

- **Python 3.9+**
- **Node.js 16+** and npm
- **Poppler** (for PDF processing)
  - macOS: `brew install poppler`
  - Linux: `sudo apt-get install poppler-utils`
  - Windows: Download from [poppler-windows](https://github.com/oschwartz10612/poppler-windows/releases/)
- **Azure Document Intelligence** subscription
- **Anthropic Claude API** key

## Installation

### 1. Clone the Repository

```bash
cd "/Users/kranthiramnekkalapu/Documents/04 Trainings/12 Doc deidentification"
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.template .env
# Edit .env with your API keys
```

**Required environment variables in `.env`:**

```env
AZURE_DOCUMENT_INTELLIGENCE_KEY=your_azure_key_here
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=your_azure_endpoint_here
ANTHROPIC_API_KEY=your_anthropic_key_here
```

### 3. Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install
```

## Running the Application

### Start Backend Server

```bash
cd backend
source venv/bin/activate  # Activate virtual environment
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend will be available at: `http://localhost:8000`

### Start Frontend Development Server

In a new terminal:

```bash
cd frontend
npm run dev
```

Frontend will be available at: `http://localhost:5173`

## Usage

### 1. Upload Document
- Drag and drop a single-page PDF or click to browse
- File size limit: 10MB
- Only PDF files are accepted

### 2. Configure De-identification Rules
- Define fields to identify (e.g., "Full Name", "Email", "SSN")
- Add descriptions to help AI understand what to look for
- Choose replacement strategy for each field:
  - **Fake Data**: Generates realistic replacements using Faker library
  - **Black Out**: Complete redaction with white/black rectangles
  - **Entity Label**: Generic labels like Person_A, Email_1

### 3. Review Identified Entities
- Review all entities detected by AI
- Edit replacement text if needed
- Select/deselect entities to mask
- Check confidence scores

### 4. Compare & Download
- View original and masked PDFs side-by-side
- Download the de-identified PDF
- Process another document

## API Endpoints

### `POST /api/upload`
Upload a PDF file for processing.

**Request:** Multipart form data with PDF file

**Response:**
```json
{
  "session_id": "uuid",
  "filename": "document.pdf",
  "file_size": 123456,
  "preview_url": "/api/files/temp_images/uuid.png"
}
```

### `POST /api/process`
Process document to extract entities.

**Request:**
```json
{
  "session_id": "uuid",
  "field_definitions": [
    {
      "name": "Full Name",
      "description": "Person's full name",
      "strategy": "Fake Data"
    }
  ]
}
```

**Response:**
```json
{
  "session_id": "uuid",
  "entities": [
    {
      "id": "entity_1",
      "entity_type": "Full Name",
      "original_text": "John Doe",
      "replacement_text": "Emma Rodriguez",
      "bounding_box": [100, 200, 150, 30],
      "confidence": 0.95,
      "approved": true
    }
  ],
  "total_entities": 5
}
```

### `POST /api/approve-and-mask`
Generate masked PDF with approved entities.

**Request:**
```json
{
  "session_id": "uuid",
  "approved_entity_ids": ["entity_1", "entity_2"],
  "updated_entities": null
}
```

**Response:**
```json
{
  "session_id": "uuid",
  "original_pdf_url": "/api/files/uploads/uuid.pdf",
  "masked_pdf_url": "/api/files/output/uuid_masked.pdf",
  "entities_masked": 5
}
```

### `GET /api/files/{folder}/{filename}`
Serve files for download/preview.

### `GET /api/health`
Health check endpoint.

## Replacement Strategies

### Fake Data
Uses the Faker library to generate realistic replacements based on entity type:

- **Names**: John Doe → Emma Rodriguez
- **Emails**: john@email.com → emma.rodriguez@example.com
- **Phone**: (555) 123-4567 → (555) 987-6543
- **SSN**: 123-45-6789 → 987-65-4321
- **Addresses**: 123 Main St → 456 Oak Avenue
- **Companies**: Acme Corp → TechFlow Industries
- **Dates**: 01/15/1990 → 03/22/1985

### Black Out
Completely removes text by drawing white rectangles over identified regions.

### Entity Label
Replaces with generic labels:
- Person_A, Person_B, Person_C
- Email_1, Email_2, Email_3
- SSN_1, SSN_2, etc.

## Consistency Mechanism

PrivaSee ensures that the same entity is always replaced with the same value:

1. **Text Normalization**: Converts to lowercase, removes extra spaces and punctuation
2. **Mapping Storage**: Maintains a dictionary of original → replacement mappings
3. **Typo Handling**: Claude Vision AI recognizes variations (e.g., "John", "Jhon", "Jon" → same person)
4. **Session Persistence**: Mappings persist throughout the document processing session

**Example:**
```
Original Document:
"John Doe works at Acme Corp. Contact John at john@email.com"

After De-identification:
"Emma Rodriguez works at TechFlow Industries. Contact Emma Rodriguez at emma.rodriguez@example.com"
```

## Development

### Backend Testing

```bash
cd backend
pytest tests/
```

### Frontend Development

```bash
cd frontend
npm run dev    # Development server
npm run build  # Production build
npm run preview # Preview production build
```

### Code Quality

```bash
# Backend
cd backend
black app/           # Code formatting
pylint app/          # Linting

# Frontend
cd frontend
npm run lint         # ESLint
```

## Security Considerations

1. **API Keys**: Never commit `.env` files. Use `.env.template` as reference
2. **File Storage**: Uploaded files are stored locally in `data/` directory
3. **Session Management**: In-memory storage for MVP. Use Redis/DB for production
4. **CORS**: Configured for `localhost:5173` by default. Update for production
5. **File Cleanup**: Manually delete processed files from `data/` directories

## Troubleshooting

### Poppler Not Found
```bash
# macOS
brew install poppler

# Linux
sudo apt-get install poppler-utils

# Windows
# Download and add to PATH: https://github.com/oschwartz10612/poppler-windows/releases/
```

### Azure OCR Errors
- Verify `AZURE_DOCUMENT_INTELLIGENCE_KEY` and `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` in `.env`
- Check Azure subscription is active
- Ensure document is a valid PDF

### Claude API Errors
- Verify `ANTHROPIC_API_KEY` in `.env`
- Check API rate limits
- Ensure image is under size limits (default 5MB)

### CORS Issues
- Verify backend is running on port 8000
- Check `ALLOWED_ORIGINS` in `.env` includes your frontend URL

## Performance

- **PDF Upload**: < 1 second for documents under 5MB
- **OCR Analysis**: 2-5 seconds (Azure Document Intelligence)
- **Entity Extraction**: 3-10 seconds (Claude Vision API)
- **Masking & PDF Generation**: 1-2 seconds

Total processing time: **6-17 seconds** per document

## Limitations

- **Single Page Only**: Currently supports single-page PDFs
- **File Size**: 10MB maximum
- **Language**: Optimized for English documents
- **Session Storage**: In-memory (cleared on server restart)

## Future Enhancements

- [ ] Multi-page PDF support
- [ ] Batch processing
- [ ] Database integration for sessions
- [ ] Additional language support
- [ ] Custom entity type definitions
- [ ] Export/import de-identification rules
- [ ] Audit trail and logging
- [ ] Docker containerization

## License

MIT License - See LICENSE file for details

## Support

For issues, questions, or contributions, please open an issue on the GitHub repository.

## Acknowledgments

- **Azure Document Intelligence** for OCR capabilities
- **Anthropic Claude** for AI-powered entity extraction
- **Faker** library for realistic fake data generation
- **FastAPI** for the backend framework
- **React + Vite** for the frontend framework

---

**Built with ❤️ for Privacy**
