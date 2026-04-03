# Project Structure

```
vinylripper/
├── README.md                 # Main documentation
├── QUICKSTART.md            # Quick start guide
├── TECHNICAL.md             # Technical documentation
├── package.json             # Node.js dependencies
├── test-api.sh              # API testing script
├── .gitignore              # Git ignore rules
│
├── src/                     # Source code
│   ├── index.js            # Express server (entry point)
│   ├── config.js           # Configuration settings
│   ├── logger.js           # Logging setup
│   ├── audioProcessor.js   # Audio analysis and splitting
│   ├── musicbrainz.js      # MusicBrainz API client
│   ├── trackMatcher.js     # Track matching algorithm
│   ├── vinylRipper.js      # Main orchestration
│   └── public/
│       └── index.html      # Web interface
│
├── uploads/                 # Temporary upload directory (auto-created)
├── output/                  # Output directory for ripped albums (auto-created)
└── node_modules/           # Dependencies (ignored by git)
```

## Key Features Implemented

### 1. Web Interface
- Clean, modern UI for uploading files
- Support for 2-4 album sides (A, B, C, D)
- Real-time progress feedback
- Track listing display with confidence scores

### 2. Audio Processing
- FFmpeg-based silence detection
- Smart splitting algorithm
- Live album support (relative loudness detection)
- Quality preservation (320kbps MP3)
- Configurable thresholds and parameters

### 3. MusicBrainz Integration
- Automatic album search
- Track listing retrieval
- Proper rate limiting (1 req/sec)
- Graceful fallback when API unavailable

### 4. Track Matching
- Length-based matching algorithm
- Confidence scoring (0-100%)
- Configurable tolerance (±5 seconds)
- Automatic file naming

### 5. File Organization
- Creates organized output folders: `<Artist> - <Album>`
- Numbered track names: `01 - Track Title.mp3`
- Automatic cleanup of temporary files
- Safe filename sanitization

## How It Works

1. **Upload**: User uploads MP3 files via web interface
2. **Analysis**: FFmpeg analyzes audio for silence/quiet sections
3. **Splitting**: Tracks are split at detected break points
4. **API Query**: MusicBrainz is queried for official track listing
5. **Matching**: Detected tracks are matched with official tracks by length
6. **Naming**: Files are renamed with track numbers and titles
7. **Output**: Organized album folder is created in `output/`

## Technology Stack

- **Node.js**: Runtime environment
- **Express**: Web server framework
- **Multer**: File upload handling
- **FFmpeg**: Audio processing (external dependency)
- **fluent-ffmpeg**: Node.js wrapper for FFmpeg
- **music-metadata**: Audio metadata parsing
- **MusicBrainz API**: Track metadata source
- **Pino**: Structured logging

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

## API Endpoints

- `GET /` - Web interface
- `POST /api/rip` - Process vinyl rip
- `GET /api/health` - Health check

## Error Handling

- File validation (size, type)
- Missing required fields
- FFmpeg processing errors
- MusicBrainz API failures
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
