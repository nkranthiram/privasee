#!/bin/bash

# PrivaSee Frontend Startup Script

echo "🚀 Starting PrivaSee Frontend..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📥 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
fi

# Start the development server
echo "🌐 Starting Vite dev server on http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm run dev
