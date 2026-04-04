export default {
  port: 3000,

  // Audio processing settings
  audio: {
    // Progressive silence detection - tries each level until enough silences are found
    silenceDetection: [
      { threshold: -40, duration: 1.5, label: 'strict' },
      { threshold: -35, duration: 1.0, label: 'moderate' },
      { threshold: -30, duration: 0.5, label: 'lenient' },
      { threshold: -25, duration: 0.3, label: 'very lenient' }
    ],
    // Minimum track length (seconds)
    minTrackLength: 30,
    // For live albums: look for relative quiet sections (percentile-based)
    liveAlbumMode: {
      // Use relative loudness detection
      enabled: true,
      // Consider sections quieter than this percentile as potential breaks
      quietPercentile: 15,
      // Minimum quiet section duration (seconds)
      minQuietDuration: 0.3
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