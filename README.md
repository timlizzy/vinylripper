# Vinyl Ripper

A Node.js application for converting vinyl album recordings into individual track files.

## Features

- Upload 2-4 MP3 files (album sides A, B, C, D)
- **Auto-fill artist & album** from Side A filename (e.g., `Artist - Album - Side A.mp3`)
- Automatic silence detection and track splitting
- Smart splitting for live albums (detects relative quiet sections)
- Music onset detection for tracks without clear silence gaps
- **Discogs API** integration for per-side track counts (guides splitting accuracy)
- **MusicBrainz API** integration for track metadata and naming
- Automatic track naming based on official track listings
- Length-based track matching with confidence scoring
- **Detailed processing log** in the browser (album lookup, silence detection, track matching)
- **Waveform visualization** showing first/last 10 seconds of each track
- **Configurable output folder** — set default in config, editable per-rip in the UI
- Structured logging with Pino

## Prerequisites

- Node.js 18+ (for native fetch support)
- FFmpeg installed on your system

### Installing FFmpeg

**macOS (Homebrew):**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt-get install ffmpeg
```

**Windows (Chocolatey):**
```bash
choco install ffmpeg
```

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

Then open your browser to `http://localhost:3000`

## How It Works

1. **Upload** MP3 files for each album side — artist and album are auto-filled from the Side A filename
2. Enter or adjust the artist name and album title
3. The app queries **Discogs** for per-side track counts and **MusicBrainz** for track metadata
4. Each side is analyzed: silence detection → music onset detection → smart splitting
5. Expected track counts from Discogs guide the detection sensitivity
6. Tracks are matched against the official listing by position and duration
7. Optionally change the **output folder** (defaults to `output/`, configurable in config and UI)
8. Output is saved to `<outputDir>/<Artist> - <Album>/`
9. The browser shows a **processing log** with full details and **waveform previews** per track

## Filename Convention

For automatic artist/album detection, name your recordings:
```
Artist - Album - Side A.mp3
Artist - Album - Side B.mp3
```
The app parses `Artist`, `Album`, and `Side X` from the filename and pre-fills the form fields.

## Configuration

Edit `src/config.js` to adjust:
- **Output directory** (`outputDir`) — default folder for ripped albums (also editable in the UI)
- Silence detection threshold and duration
- Minimum track length
- API rate limiting
- Discogs API token (optional, for higher rate limits)
- Port number
