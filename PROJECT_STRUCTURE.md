# Project Structure

```
vinylripper/
├── README.md                 # Main documentation
├── QUICKSTART.md            # Quick start guide
├── TECHNICAL.md             # Technical documentation
├── PROJECT_STRUCTURE.md     # This file
├── package.json             # Node.js dependencies
├── test-api.sh              # API testing script
├── .gitignore              # Git ignore rules
│
├── src/                     # Source code
│   ├── index.js            # Express server (entry point)
│   ├── config.js           # Configuration settings
│   ├── logger.js           # Structured logging (Pino)
│   ├── audioProcessor.js   # Audio analysis, splitting, waveform extraction
│   ├── discogs.js          # Discogs API client (per-side track info)
│   ├── musicbrainz.js      # MusicBrainz API client (track metadata)
│   ├── trackMatcher.js     # Track matching algorithm
│   ├── vinylRipper.js      # Main orchestration
│   └── public/
│       └── index.html      # Web interface (upload form, processing log, waveforms)
│
├── uploads/                 # Temporary upload directory (auto-created)
├── output/                  # Output directory for ripped albums (auto-created)
└── node_modules/           # Dependencies (ignored by git)
```

## Key Features Implemented

### 1. Web Interface
- Clean, modern UI for uploading files
- Support for 2-4 album sides (A, B, C, D)
- **Auto-fill artist & album** from Side A filename (e.g., `Artist - Album - Side A.mp3`)
- Real-time progress feedback
- **Processing Details** panel with color-coded log entries
- Track listing with confidence scores
- **Waveform visualization** (first/last 10 seconds per track)

### 2. Audio Processing
- FFmpeg-based silence detection with adaptive thresholds
- **Music onset detection** via spectral flux analysis
- Expected track count–guided sensitivity (from Discogs)
- Live album support (relative loudness detection)
- Quality preservation (320kbps MP3)
- Configurable thresholds and parameters
- **Waveform extraction** (mono PCM → amplitude bins)

### 3. Discogs Integration
- Album search with vinyl format preference
- **Per-side track counts** (A1, A2, B1, B2, etc.)
- Track durations when available
- Guides silence detection sensitivity per side
- Processing log entries sent to browser

### 4. MusicBrainz Integration
- Automatic album search
- Track listing retrieval with durations
- Multi-media (multi-disc) support
- Proper rate limiting (1 req/sec)
- Graceful fallback when API unavailable
- Processing log entries sent to browser

### 5. Track Matching
- Per-side matching using Discogs position data
- Length-based matching algorithm (MusicBrainz fallback)
- Confidence scoring (0-100%)
- Configurable tolerance (±5 seconds)
- Automatic file naming

### 6. File Organization
- Creates organized output folders: `<Artist> - <Album>`
- Numbered track names: `01 - Track Title.mp3` (or `A1 - Title.mp3` with Discogs)
- Automatic cleanup of temporary files
- Safe filename sanitization

## How It Works

1. **Upload**: User uploads MP3 files — artist/album auto-filled from Side A filename
2. **Lookup**: Discogs queried for per-side track counts; MusicBrainz for track metadata
3. **Analysis**: FFmpeg analyzes audio (silence → onset detection → loudness analysis)
4. **Splitting**: Tracks are split at detected break points, guided by expected counts
5. **Matching**: Detected tracks matched with official tracks by position and duration
6. **Waveforms**: First/last 10 seconds extracted as amplitude data for each track
7. **Naming**: Files renamed with track numbers and titles
8. **Output**: Organized album folder created in `output/`; browser shows full results

## Technology Stack

- **Node.js**: Runtime environment
- **Express**: Web server framework
- **Multer**: File upload handling
- **FFmpeg**: Audio processing (external dependency)
- **fluent-ffmpeg**: Node.js wrapper for FFmpeg
- **music-metadata**: Audio metadata parsing
- **Discogs API**: Per-side track info source
- **MusicBrainz API**: Track metadata source
- **Pino**: Structured logging
- **HTML Canvas**: Waveform rendering (client-side)

## Running the Application

```bash
# Install dependencies
npm install

# Start server
npm start

# Visit http://localhost:3000
```

## Configuration Options

Edit `src/config.js`:

- **Port**: Server port (default: 3000)
- **Silence threshold**: -40dB (lower = more sensitive)
- **Min silence duration**: 1.5 seconds
- **Min track length**: 30 seconds
- **Length tolerance**: ±5 seconds for matching
- **Min confidence**: 70% for accepting matches
- **Max file size**: 500MB per upload
- **Discogs token**: Optional, for higher API rate limits

## API Endpoints

- `GET /` - Web interface
- `POST /api/rip` - Process vinyl rip (returns tracks, processingLog, waveforms)
- `GET /api/health` - Health check

## Error Handling

- File validation (size, type)
- Missing required fields
- FFmpeg processing errors
- Discogs API failures (falls back to MusicBrainz)
- MusicBrainz API failures (continues without matching)
- Processing log included in error responses
- Automatic file cleanup on errors

## Future Enhancements

Possible improvements:
- FLAC/WAV support
- Audio fingerprinting (AcoustID)
- ID3 tag writing with album art
- Batch processing
- WebSocket progress updates
- Manual track adjustment UI
- Docker containerization
- Database for processing history