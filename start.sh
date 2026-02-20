#!/bin/bash

# PrivaSee - Full Stack Startup Script

echo "========================================"
echo "   PrivaSee - Document De-identification"
echo "========================================"
echo ""

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        return 0
    else
        return 1
    fi
}

# Check if backend port is available
if check_port 8000; then
    echo "⚠️  Port 8000 is already in use. Backend might already be running."
    read -p "Do you want to continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if frontend port is available
if check_port 5173; then
    echo "⚠️  Port 5173 is already in use. Frontend might already be running."
    read -p "Do you want to continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "🔧 Starting PrivaSee services..."
echo ""

# Start backend in background
echo "📡 Starting Backend (http://localhost:8000)..."
cd backend
chmod +x run.sh
./run.sh &
BACKEND_PID=$!
cd ..

# Wait for backend to start
echo "⏳ Waiting for backend to initialize..."
sleep 5

# Start frontend in background
echo "🎨 Starting Frontend (http://localhost:5173)..."
cd frontend
chmod +x run.sh
./run.sh &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ PrivaSee is now running!"
echo ""
echo "📌 Access the application:"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "📝 Press Ctrl+C to stop all services"
echo ""

# Handle cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping PrivaSee services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    # Kill any remaining processes on the ports
    lsof -ti:8000 | xargs kill -9 2>/dev/null
    lsof -ti:5173 | xargs kill -9 2>/dev/null
    echo "✅ Services stopped"
    exit 0
}

trap cleanup INT TERM

# Wait for processes
wait
