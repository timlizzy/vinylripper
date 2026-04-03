# Vinyl Ripper - Technical Documentation

## Architecture

The application consists of several key modules:

### Core Modules

1. **audioProcessor.js** - Handles audio analysis and splitting
   - Silence detection using FFmpeg's silencedetect filter
   - Loudness analysis for live albums
   - Smart splitting based on quiet sections
   - Track extraction with quality preservation

2. **musicbrainz.js** - MusicBrainz API integration
   - Album search by artist and title
   - Track listing retrieval
   - Respects API rate limits (1 request/second)

3. **trackMatcher.js** - Track matching algorithm
   - Length-based matching with configurable tolerance
   - Confidence scoring
   - Automatic track naming

4. **vinylRipper.js** - Main orchestration
   - Coordinates the entire ripping process
   - Manages temporary files
   - Creates output directories

5. **index.js** - Express web server
   - File upload handling with multer
   - REST API endpoints
   - Static file serving

## Audio Processing Details

### Silence Detection

The application uses FFmpeg's `silencedetect` filter with configurable parameters:

- **Threshold**: Default -40dB (adjustable in config)
- **Duration**: Minimum 1.5 seconds of silence
- **Detection**: Finds start and end points of silence

### Live Album Mode

For albums without clear silence breaks:

1. Analyzes RMS (Root Mean Square) loudness across the entire file
2. Calculates a percentile threshold (default: 20th percentile)
3. Identifies sections quieter than the threshold
4. Groups continuous quiet sections as potential track breaks

### Track Splitting

- Uses FFmpeg's `-ss` (seek) and `-t` (duration) flags
- Preserves audio quality with 320kbps MP3 encoding
- Filters tracks shorter than minimum length (30s default)

## MusicBrainz Integration

### API Endpoints Used

1. **Release Search**: `/ws/2/release?query=...`
   - Searches for releases by artist and title
   - Returns up to 5 results

2. **Release Details**: `/ws/2/release/{id}?inc=recordings`
   - Retrieves full track listing
   - Includes track lengths in milliseconds

### Rate Limiting

- Enforced 1-second delay between requests
- User-Agent header identifies the application

### Track Matching Algorithm

```javascript
confidence = 1 - (|detected_length - official_length| / tolerance)
```

- Tolerance: 5 seconds by default
- Minimum confidence: 0.7 (70%)
- Uses greedy matching (best match first)

## File Organization

Output structure:
```
output/
└── <Artist> - <Album>/
    ├── 01 - Track Title.mp3
    ├── 02 - Track Title.mp3
    └── ...
```

## Configuration

All settings in `src/config.js`:

```javascript
{
  port: 3000,
  audio: {
    silenceThreshold: -40,      // dB
    minSilenceDuration: 1.5,    // seconds
    minTrackLength: 30          // seconds
  },
  matching: {
    lengthTolerance: 5,         // seconds
    minConfidence: 0.7          // 0-1
  },
  upload: {
    maxFileSize: 500MB
  }
}
```

## API Reference

### POST /api/rip

Uploads and processes vinyl album recordings.

**Request** (multipart/form-data):
- `artist` (string, required): Artist/band name
- `album` (string, required): Album title
- `sideA` (file, required): MP3 file for side A
- `sideB` (file, required): MP3 file for side B
- `sideC` (file, optional): MP3 file for side C
- `sideD` (file, optional): MP3 file for side D

**Response**:
```json
{
  "success": true,
  "artist": "Artist Name",
  "album": "Album Title",
  "outputDir": "output/Artist - Album",
  "tracks": [
    {
      "trackNumber": 1,
      "fileName": "01 - Track Title.mp3",
      "duration": 245.6,
      "matched": true,
      "title": "Track Title",
      "confidence": 0.95
    }
  ],
  "metadata": {
    "id": "release-id",
    "title": "Album Title",
    "artist": "Artist Name"
  },
  "duration": 45000
}
```

### GET /api/health

Health check endpoint.

**Response**:
```json
{
  "status": "ok"
}
```

## Error Handling

The application handles various error scenarios:

1. **Missing files**: Returns 400 error if sides A and B are not provided
2. **Invalid file types**: Multer rejects non-MP3 files
3. **File size limits**: Enforces 500MB maximum per file
4. **MusicBrainz API failures**: Continues without matching if API is unavailable
5. **FFmpeg errors**: Detailed logging for debugging

## Performance Considerations

- Processing time depends on:
  - Total audio length
  - Number of tracks
  - Silence detection complexity
  - MusicBrainz API response time

- Average processing time: 2-5 minutes for a typical album

## Future Enhancements

Potential improvements:

1. Support for more audio formats (FLAC, WAV)
2. Advanced audio fingerprinting (AcoustID)
3. Batch processing multiple albums
4. Queue system for concurrent requests
5. Progress updates via WebSockets
6. Manual track adjustment interface
7. ID3 tag writing with album art
8. Docker containerization
