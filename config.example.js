// Example configuration file for advanced users
// Copy this to src/config.js and adjust to your needs

export default {
  // Server configuration
  port: 3000,

  // Output directory for ripped albums (relative or absolute path)
  // An album subfolder (<Artist> - <Album>) is created inside this directory
  // Can also be changed per-rip in the web UI
  outputDir: 'output',

  // Audio processing settings
  audio: {
    // Silence detection threshold in dB
    // Lower values (more negative) = more sensitive to silence
    // Range: -60 to -20 dB
    // -50: Very sensitive (might split mid-song)
    // -40: Default (good for most albums)
    // -30: Less sensitive (good for noisy recordings)
    silenceThreshold: -40,

    // Minimum duration of silence to consider as a track break
    // Range: 0.5 to 3 seconds
    // 0.5: Very short gaps (electronic music)
    // 1.5: Default (most studio albums)
    // 3.0: Longer gaps (classical, live albums)
    minSilenceDuration: 1.5,

    // Minimum track length in seconds
    // Tracks shorter than this are filtered out
    // Range: 15 to 60 seconds
    minTrackLength: 30,

    // Live album mode settings
    liveAlbumMode: {
      // Enable automatic detection of relative quiet sections
      enabled: true,

      // Percentile for quiet section detection
      // Lower values = more sensitive to quiet sections
      // Range: 10 to 30
      // 10: Very sensitive (might create many splits)
      // 20: Default (good balance)
      // 30: Less sensitive (fewer splits)
      quietPercentile: 20
    }
  },

  // Loudness normalization (EBU R128)
  // Ensures all tracks have consistent volume
  normalization: {
    // Enable/disable normalization
    enabled: true,

    // Target integrated loudness in LUFS
    // -14: Spotify, Apple Music, YouTube (recommended)
    // -16: EBU broadcast standard
    // -11: Louder (for portable listening)
    targetLoudness: -14,

    // True peak ceiling in dBTP (prevents digital clipping)
    // -1.0: Default (safe for all DACs and codecs)
    // -2.0: Extra headroom (for lossy re-encoding)
    truePeak: -1.0,

    // Loudness range target in LU (0 = preserve original dynamics)
    // 0: Don't adjust dynamic range (recommended for music)
    // 7-9: Compress dynamics slightly (podcast-style)
    loudnessRange: 0
  },

  // Track matching settings
  matching: {
    // Maximum difference in seconds for considering tracks as matching
    // Range: 3 to 10 seconds
    // 3: Strict matching
    // 5: Default (accommodates most vinyl variations)
    // 10: Loose matching (for highly variable recordings)
    lengthTolerance: 5,

    // Minimum confidence score to accept a match (0-1)
    // Range: 0.5 to 0.9
    // 0.5: Accept more matches (might be incorrect)
    // 0.7: Default (good balance)
    // 0.9: Only accept very confident matches
    minConfidence: 0.7
  },

  // File upload limits
  upload: {
    // Maximum file size in bytes
    // Default: 500MB (good for high-quality vinyl rips)
    maxFileSize: 500 * 1024 * 1024,

    // Allowed MIME types for uploads
    allowedMimeTypes: ['audio/mpeg', 'audio/mp3']
  },

  // MusicBrainz API settings
  musicbrainz: {
    // Delay between API requests (milliseconds)
    // MusicBrainz requires at least 1000ms
    rateLimitDelay: 1000,

    // Maximum number of search results to retrieve
    maxSearchResults: 5,

    // User agent string (customize if needed)
    userAgent: 'VinylRipper/1.0.0 (educational project)'
  }
};

/*
EXAMPLE CONFIGURATIONS FOR SPECIFIC USE CASES

1. HIGH-QUALITY STUDIO ALBUMS (clear track separation):
{
  audio: {
    silenceThreshold: -45,
    minSilenceDuration: 1.0,
    minTrackLength: 30
  },
  matching: {
    lengthTolerance: 3,
    minConfidence: 0.8
  }
}

2. LIVE ALBUMS (continuous music, audience noise):
{
  audio: {
    silenceThreshold: -35,
    minSilenceDuration: 2.0,
    minTrackLength: 45,
    liveAlbumMode: {
      enabled: true,
      quietPercentile: 15
    }
  },
  matching: {
    lengthTolerance: 8,
    minConfidence: 0.6
  }
}

3. OLD/NOISY VINYL (scratches, pops):
{
  audio: {
    silenceThreshold: -30,
    minSilenceDuration: 2.0,
    minTrackLength: 30
  },
  matching: {
    lengthTolerance: 7,
    minConfidence: 0.6
  }
}

4. ELECTRONIC/DANCE MUSIC (minimal gaps):
{
  audio: {
    silenceThreshold: -50,
    minSilenceDuration: 0.7,
    minTrackLength: 90
  },
  matching: {
    lengthTolerance: 5,
    minConfidence: 0.7
  }
}

5. CLASSICAL MUSIC (long tracks, movements):
{
  audio: {
    silenceThreshold: -50,
    minSilenceDuration: 3.0,
    minTrackLength: 60
  },
  matching: {
    lengthTolerance: 10,
    minConfidence: 0.5
  }
}
*/
