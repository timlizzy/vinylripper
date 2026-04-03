export default {
  port: 3000,

  // Audio processing settings
  audio: {
    // Silence detection threshold in dB (lower = more sensitive)
    silenceThreshold: -40,
    // Minimum silence duration to consider as track break (seconds)
    minSilenceDuration: 1.5,
    // Minimum track length (seconds)
    minTrackLength: 30,
    // For live albums: look for relative quiet sections (percentile-based)
    liveAlbumMode: {
      // Use relative loudness detection
      enabled: true,
      // Consider sections quieter than this percentile as potential breaks
      quietPercentile: 20
    }
  },

  // Track matching settings
  matching: {
    // Maximum difference in seconds for track length matching
    lengthTolerance: 5,
    // Minimum match confidence (0-1)
    minConfidence: 0.7
  },

  // Upload limits
  upload: {
    maxFileSize: 500 * 1024 * 1024, // 500MB
    allowedMimeTypes: ['audio/mpeg', 'audio/mp3']
  }
};
