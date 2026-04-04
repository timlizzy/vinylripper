# Vinyl Ripper - Technical Documentation

## Architecture

The application consists of several key modules:

### Core Modules

1. **audioProcessor.js** - Handles audio analysis and splitting
   - Silence detection using FFmpeg's silencedetect filter
   - Loudness analysis for live albums (RMS-based)
   - Music onset detection using spectral flux analysis
   - Expected track count–guided sensitivity adjustment
   - Waveform extraction for visual previews
   - Track extraction with quality preservation (320kbps MP3)

2. **discogs.js** - Discogs API integration
   - Album search by artist and title
   - Per-side track counts and durations (vinyl-specific metadata)
   - Guides silence detection sensitivity per side
   - Detailed processing log entries for the browser

3. **musicbrainz.js** - MusicBrainz API integration
   - Album search by artist and title
   - Track listing retrieval with durations
   - Multi-media (multi-disc) support
   - Respects API rate limits (1 request/second)
   - Detailed processing log entries for the browser

4. **trackMatcher.js** - Track matching algorithm
   - Per-side matching using Discogs position data
   - Length-based matching with configurable tolerance
   - Confidence scoring
   - Automatic track naming with `generateTrackName()`

5. **vinylRipper.js** - Main orchestration
   - Looks up metadata first (Discogs → MusicBrainz)
   - Passes expected track counts to audio processing
   - Collects processing log entries from all modules
   - Extracts waveform data for each output track
   - Manages temporary files and output directories

6. **index.js** - Express web server
   - File upload handling with multer
   - REST API endpoints
   - Static file serving
   - Returns `processingLog` array in API responses

7. **logger.js** - Structured logging with Pino

## Audio Processing Details

### Silence Detection

The application uses FFmpeg's `silencedetect` filter with configurable parameters:

- **Threshold**: Default -40dB (adjustable in config)
- **Duration**: Minimum 1.5 seconds of silence
- **Detection**: Finds start and end points of silence

When Discogs provides expected track counts for a side, the threshold is adjusted automatically. If `N` tracks are expected but fewer silences are found, the threshold is raised (e.g., from -40dB to -35dB) and detection is retried.

### Music Onset Detection

When silence detection finds too few breaks (even after threshold adjustment):

1. FFmpeg extracts raw PCM audio (mono, 22050 Hz)
2. Spectral flux is computed across 0.5-second windows
3. A dynamic threshold (mean + 1.5× standard deviation) identifies energy jumps
4. Onset candidates are filtered by minimum track length
5. If expected track count is known, the top N-1 onsets are selected

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

### Waveform Extraction

For each output track, the app extracts amplitude data for visual previews:

1. FFmpeg decodes to mono PCM at 8000 Hz
2. Raw samples are read and binned into N buckets (default: 200 per 10 seconds)
3. Each bin contains the RMS amplitude normalized to 0.0–1.0
4. First 10 seconds and last 10 seconds are extracted separately
5. Client renders waveforms on HTML Canvas with auto-normalization (up to 3× gain)

## Discogs Integration

### API Endpoints Used

1. **Database Search**: `GET /database/search?type=release&artist=...&release_title=...`
   - Searches for vinyl releases
   - Returns results with format info (LP, vinyl, etc.)

2. **Release Details**: `GET /releases/{id}`
   - Retrieves full tracklist with per-side positions (A1, A2, B1, B2, etc.)
   - Includes track durations when available

### Per-Side Track Info

Discogs track positions (e.g., A1, A2, B1) are parsed to build a per-side map:
```javascript
{ A: { trackCount: 5, tracks: [...] }, B: { trackCount: 6, tracks: [...] } }
```
This guides silence detection sensitivity — if Side A should have 5 tracks, the detector adjusts until it finds approximately 4 split points.

### Rate Limiting

- Respects Discogs rate limit headers
- Falls back to 1-second delay between requests
- Optional authentication token for higher limits

## MusicBrainz Integration

### API Endpoints Used

1. **Release Search**: `/ws/2/release?query=...`
   - Searches for releases by artist and title
   - Returns up to 5 results with match scores

2. **Release Details**: `/ws/2/release/{id}?inc=recordings+media`
   - Retrieves full track listing with durations
   - Includes multi-media info (disc 1 = Side A, disc 2 = Side B)

### Rate Limiting

- Enforced 1-second delay between requests
- User-Agent header identifies the application

### Track Matching Algorithm

When per-side Discogs data is available:
- Tracks are matched by position order within each side
- Confidence is calculated from duration similarity

Fallback (MusicBrainz only):
```javascript
confidence = 1 - (|detected_length - official_length| / tolerance)
```

- Tolerance: 5 seconds by default
- Minimum confidence: 0.7 (70%)
- Uses greedy matching (best match first)

## Web Interface

### Auto-Fill from Filename

When the user selects a Side A file, the filename is parsed:
```
Artist - Album - Side A.mp3
  →  artist = "Artist"
  →  album  = "Album"
```

The parser splits on ` - `, detects `Side [A-D]` as the last segment, and uses everything in between as the album title. Fields are only auto-filled if currently empty.

### Processing Log

The API response includes a `processingLog` array of entries:
```javascript
{ type: "heading|info|success|warning|error", message: "..." }
```

The browser renders these in a collapsible dark-themed panel with color-coded entries and icons.

### Waveform Visualization

Each track shows two canvas-based waveform panels:
- **Start (green)**: First 10 seconds of the track
- **End (amber)**: Last 10 seconds of the track

Rendering uses:
- HiDPI-aware canvas sizing (`devicePixelRatio`)
- Mirrored bar display (above and below center line)
- Auto-normalization: peak bar fills full height, with up to 3× gain for quiet tracks

## File Organization

Output structure:
```
output/
└── <Artist> - <Album>/
    ├── 01 - Track Title.mp3
    ├── 02 - Track Title.mp3
    └── ...
```

When Discogs provides side positions, tracks from Side A use the Discogs position (e.g., `A1 - Bombtrack.mp3`).

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
    maxFileSize: '500MB'
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
      "confidence": 0.95,
      "waveform": {
        "start": [0.12, 0.45, ...],
        "end": [0.33, 0.21, ...],
        "startLabel": "0:00 – 0:10",
        "endLabel": "3:55 – 4:05"
      }
    }
  ],
  "metadata": { ... },
  "processingLog": [
    { "type": "heading", "message": "Album Lookup" },
    { "type": "success", "message": "Found on Discogs: ..." },
    { "type": "info", "message": "Side A: 5 tracks expected" }
  ],
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
4. **Discogs API failures**: Falls back to MusicBrainz; logged in processingLog
5. **MusicBrainz API failures**: Continues without matching; logged in processingLog
6. **FFmpeg errors**: Detailed logging for debugging
7. **Processing errors**: `processingLog` is included even in error responses

## Performance Considerations

- Processing time depends on:
  - Total audio length
  - Number of tracks
  - Silence/onset detection complexity
  - Discogs + MusicBrainz API response times
  - Waveform extraction (adds ~1-2s per track)

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