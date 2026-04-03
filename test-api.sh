#!/bin/bash

# Example script to test the vinyl ripper with sample files
# This script demonstrates how to use the API directly via curl

ARTIST="The Beatles"
ALBUM="Abbey Road"

echo "Testing Vinyl Ripper API..."
echo "Artist: $ARTIST"
echo "Album: $ALBUM"
echo ""

# Note: Replace these paths with actual MP3 files
SIDE_A="/path/to/side_a.mp3"
SIDE_B="/path/to/side_b.mp3"

# Check if files exist
if [ ! -f "$SIDE_A" ] || [ ! -f "$SIDE_B" ]; then
    echo "Error: Please update the file paths in this script"
    echo "Set SIDE_A and SIDE_B to point to your MP3 files"
    exit 1
fi

# Make the API request
curl -X POST http://localhost:3000/api/rip \
  -F "artist=$ARTIST" \
  -F "album=$ALBUM" \
  -F "sideA=@$SIDE_A" \
  -F "sideB=@$SIDE_B" \
  | jq '.'

echo ""
echo "Check the output/ directory for results"
