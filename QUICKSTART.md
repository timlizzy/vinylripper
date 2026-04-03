# Quick Start Guide

## Setup

1. Make sure FFmpeg is installed:
   ```bash
   ffmpeg -version
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open your browser to [http://localhost:3000](http://localhost:3000)

## Usage

### Web Interface

1. Enter the artist name (e.g., "Pink Floyd")
2. Enter the album title (e.g., "The Dark Side of the Moon")
3. Upload MP3 files for each side:
   - Side A (required)
   - Side B (required)
   - Side C (optional)
   - Side D (optional)
4. Click "Start Ripping"
5. Wait for processing to complete
6. Find your tracks in the `output/` directory

### Tips for Best Results

**Recording Quality**
- Use high-quality recordings (at least 192kbps)
- Minimize background noise
- Keep consistent volume levels

**Album Sides**
- Record each side as a separate file
- Include the full side from start to finish
- Don't manually split tracks before uploading

**Silence Detection**
- Works best with clear gaps between tracks
- For live albums, the app will automatically detect relative quiet sections
- Minimum track length is 30 seconds (configurable)

**MusicBrainz Matching**
- Enter artist and album names exactly as they appear on MusicBrainz
- If no match is found, tracks will be named "Unknown Track"
- You can manually rename tracks afterwards

## Common Issues

### No tracks detected
- Check if your recordings have clear breaks between songs
- Try adjusting `silenceThreshold` in `src/config.js`
- For live albums, the app uses loudness analysis automatically

### Tracks don't match official listing
- Verify artist and album names are correct
- Check if the album exists on MusicBrainz
- Track lengths might differ from official versions (vinyl speed variations)
- Adjust `lengthTolerance` in config if needed

### FFmpeg errors
- Ensure FFmpeg is installed and in your PATH
- Check file permissions on upload/output directories
- Verify MP3 files are not corrupted

## File Locations

- **Uploads**: `uploads/` (temporary, auto-deleted)
- **Output**: `output/<Artist> - <Album>/`
- **Logs**: Console output (can redirect to file)

## Configuration

Edit `src/config.js` to customize:

```javascript
{
  // Server port
  port: 3000,

  // Audio processing
  audio: {
    silenceThreshold: -40,      // More negative = less sensitive
    minSilenceDuration: 1.5,    // Minimum gap length in seconds
    minTrackLength: 30          // Minimum track length in seconds
  },

  // Track matching
  matching: {
    lengthTolerance: 5,         // Seconds of acceptable difference
    minConfidence: 0.7          // 70% minimum match confidence
  }
}
```

## Example Workflow

```bash
# Start the server
npm start

# In another terminal, use the API directly
curl -X POST http://localhost:3000/api/rip \
  -F "artist=The Beatles" \
  -F "album=Abbey Road" \
  -F "sideA=@/path/to/side_a.mp3" \
  -F "sideB=@/path/to/side_b.mp3"

# Check the output
ls -la "output/The Beatles - Abbey Road/"
```

## Development

Run with auto-reload during development:
```bash
npm run dev
```

View logs with pretty formatting (included by default).

## Getting Help

- Check `TECHNICAL.md` for detailed architecture documentation
- Review logs for error messages
- Ensure FFmpeg is working: `ffmpeg -version`
- Verify file permissions on upload/output directories
