#!/bin/bash

echo "Starting Dialogue Annotation Tool..."
echo "=================================="
echo ""

# # Check if virtual environment exists
# if [ ! -d "venv" ]; then
#     echo "Creating virtual environment..."
#     python3 -m venv venv
# fi

# # Activate virtual environment
# source venv/bin/activate

# # Install dependencies
# echo "Installing dependencies..."
# pip install -q -r requirements.txt

# Run the application
echo ""
echo "Starting Flask server..."
echo "Access the application at: http://localhost:5000"
echo "Press Ctrl+C to stop the server"
echo ""

cd src
python app.py

