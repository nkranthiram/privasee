#!/bin/bash

# PrivaSee Backend Startup Script

echo "🚀 Starting PrivaSee Backend..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "⚠️  Virtual environment not found. Creating one..."
    python3 -m venv venv
    echo "✅ Virtual environment created"
fi

# Activate virtual environment
echo "📦 Activating virtual environment..."
source venv/bin/activate

# Check if dependencies are installed
if ! python -c "import fastapi" 2>/dev/null; then
    echo "📥 Installing dependencies..."
    pip install -r requirements.txt
    echo "✅ Dependencies installed"
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Please create it from .env.template"
    echo "📝 Creating .env from template..."
    cp .env.template .env
    echo "⚠️  Please edit .env with your API keys before running the server"
    exit 1
fi

# Check for required environment variables
if ! grep -q "AZURE_DOCUMENT_INTELLIGENCE_KEY=your_azure_key_here" .env; then
    # Keys have been set
    echo "✅ Environment configured"
else
    echo "⚠️  Please configure your API keys in .env file"
    exit 1
fi

# Start the server
echo "🌐 Starting FastAPI server on http://localhost:8000"
echo "📄 API docs available at http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
