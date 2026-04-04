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

1. **Upload Side A** — the artist and album fields are **auto-filled** from the filename
   - Name your files like: `Artist - Album - Side A.mp3`
   - Example: `Pink Floyd - The Dark Side of the Moon - Side A.mp3`
2. Upload Side B (and optionally C, D)
3. Adjust the artist/album fields if needed
4. Optionally change the **Output Folder** (defaults to the path set in `src/config.js`)
5. Click **"Start Ripping"**
6. Watch the **Processing Details** log for real-time progress:
   - Discogs lookup (per-side track counts)
   - MusicBrainz lookup (track names and durations)
   - Silence detection results per side
   - Music onset detection (if silence detection finds too few breaks)
   - Track matching with confidence scores
7. Review the results:
   - Each track shows its name, duration, and match confidence
   - **Waveform previews** show the first and last 10 seconds of each track
   - Green waveform = track start, amber waveform = track end
8. Find your tracks in the output directory (shown in the success message)

### Filename Convention

For best results, name your recording files:
```
Artist - Album - Side A.mp3
Artist - Album - Side B.mp3
```

The app parses the filename and auto-fills the Artist and Album fields. The `Side X` suffix is stripped from the album name.

### Tips for Best Results

**Recording Quality**
- Use high-quality recordings (at least 192kbps)
- Minimize background noise
- Keep consistent volume levels

**Album Sides**
- Record each side as a separate file
- Include the full side from start to finish
- Don't manually split tracks before uploading

**Track Detection**
- Works best with clear gaps between tracks
- For live albums, the app automatically detects relative quiet sections
- If Discogs knows the per-side track count, it guides the detection sensitivity
- Minimum track length is 30 seconds (configurable)

**Album Lookup**
- The app searches **Discogs** first (for per-side track info) and then **MusicBrainz** (for track metadata)
- Enter artist and album names as they appear on the album
- The processing log shows exactly what was found (or not found) and why
- If no match is found, tracks are saved as "Unknown Track"

## Understanding the Processing Log

The **Processing Details** panel in the browser shows exactly what happened:

| Icon | Meaning |
|------|---------|
| 📌 | Section heading (Album Lookup, Side A, Track Matching, etc.) |
| ✅ | Success (album found, track matched, etc.) |
| ℹ️ | Informational (detection parameters, counts, etc.) |
| ⚠️ | Warning (no silences found, falling back to alternative method, etc.) |
| ❌ | Error (API failure, processing error, etc.) |

## Understanding Waveforms

Each track displays two waveform panels:
- **Green (start)**: First 10 seconds — verify the track starts at the right point
- **Amber (end)**: Last 10 seconds — verify the track doesn't cut off early

If a waveform shows silence at the start, the split point may be slightly early. If the end waveform cuts off during music, the split may need adjustment.

## Common Issues

### No tracks detected
- Check if your recordings have clear breaks between songs
- The processing log will show silence detection results and explain what was tried
- Try adjusting `silenceThreshold` in `src/config.js`
- For live albums, the app uses loudness analysis automatically

### Tracks don't match official listing
- Verify artist and album names are correct
- Check the processing log for Discogs/MusicBrainz lookup results
- Track lengths might differ from official versions (vinyl speed variations)
- Adjust `lengthTolerance` in config if needed

### FFmpeg errors
- Ensure FFmpeg is installed and in your PATH
- Check file permissions on upload/output directories
- Verify MP3 files are not corrupted

## File Locations

- **Uploads**: `uploads/` (temporary, auto-deleted)
- **Output**: `output/<Artist> - <Album>/`
- **Logs**: Console output (structured JSON via Pino)

## Configuration

Edit `src/config.js` to customize:

```javascript
{
  // Server port
  port: 3000,

  // Output directory (also editable in the web UI per rip)
  outputDir: 'output',

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
  -F "sideA=@/path/to/The Beatles - Abbey Road - Side A.mp3" \
  -F "sideB=@/path/to/The Beatles - Abbey Road - Side B.mp3"

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
- Review the **Processing Details** panel in the browser for diagnostic info
- Check console logs for error messages
- Ensure FFmpeg is working: `ffmpeg -version`
- Verify file permissions on upload/output directories