# Vinyl Ripper

A Node.js application for converting vinyl album recordings into individual track files.

## Features

- Upload 2-4 MP3 files (album sides A, B, C, D)
- Automatic silence detection and track splitting
- Smart splitting for live albums (detects relative quiet sections)
- MusicBrainz API integration for track metadata
- Automatic track naming based on official track listings
- Length-based track matching

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

1. Upload MP3 files for each album side
2. Enter the artist name and album title
3. The app analyzes the audio to detect breaks between songs
4. Tracks are split automatically
5. MusicBrainz API is queried for official track listing
6. Track files are matched by length and renamed accordingly
7. Output is saved to `output/<Artist> - <Album>/`

## Configuration

Edit `src/config.js` to adjust:
- Silence detection threshold
- Minimum track length
- API rate limiting
- Port number
