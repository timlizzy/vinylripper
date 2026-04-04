import config from './config.js';
import logger from './logger.js';

function calculateConfidence(trackLength, officialLength, tolerance) {
  if (!officialLength) return 0;

  const difference = Math.abs(trackLength - officialLength);
  if (difference > tolerance) return 0;

  // Linear confidence: 1.0 at 0 difference, 0.0 at tolerance
  return 1 - (difference / tolerance);
}

export function matchTracks(detectedTracks, officialTracks) {
  logger.info(
    { detectedCount: detectedTracks.length, officialCount: officialTracks.length },
    'Matching tracks'
  );

  const log = [];
  log.push({ type: 'info', message: `Matching ${detectedTracks.length} detected track(s) against ${officialTracks.length} official track(s)` });
  log.push({ type: 'info', message: `Match settings: length tolerance ±${config.matching.lengthTolerance}s, min confidence ${Math.round(config.matching.minConfidence * 100)}%` });

  if (detectedTracks.length !== officialTracks.length) {
    log.push({
      type: 'warning',
      message: `Track count mismatch: detected ${detectedTracks.length} but expected ${officialTracks.length} — track naming may be inaccurate`
    });
  }

  const matches = [];
  const used = new Set();

  for (const detected of detectedTracks) {
    let bestMatch = null;
    let bestConfidence = 0;
    const detectedDurStr = detected.duration ? `${Math.round(detected.duration)}s` : '?s';

    for (let i = 0; i < officialTracks.length; i++) {
      if (used.has(i)) continue;

      const official = officialTracks[i];
      if (!official.length) continue;

      const confidence = calculateConfidence(
        detected.duration,
        official.length,
        config.matching.lengthTolerance
      );

      if (confidence > bestConfidence && confidence >= config.matching.minConfidence) {
        bestConfidence = confidence;
        bestMatch = { index: i, track: official };
      }
    }

    if (bestMatch) {
      used.add(bestMatch.index);
      matches.push({
        detectedTrack: detected,
        officialTrack: bestMatch.track,
        confidence: bestConfidence
      });
      log.push({
        type: 'success',
        message: `Detected track (${detectedDurStr}) → "${bestMatch.track.title}" (${bestMatch.track.length}s) — confidence: ${Math.round(bestConfidence * 100)}%`
      });
      logger.info(
        {
          trackIndex: detected.index,
          title: bestMatch.track.title,
          confidence: bestConfidence.toFixed(2)
        },
        'Track matched'
      );
    } else {
      matches.push({
        detectedTrack: detected,
        officialTrack: null,
        confidence: 0
      });
      log.push({
        type: 'warning',
        message: `Detected track (${detectedDurStr}) → no match found (no official track within ±${config.matching.lengthTolerance}s tolerance)`
      });
      logger.warn({ trackIndex: detected.index }, 'No match found for track');
    }
  }

  return { matches, log };
}

export function generateTrackName(match, fallbackIndex) {
  if (match.officialTrack) {
    const trackNumber = String(match.officialTrack.position || fallbackIndex).padStart(2, '0');
    const sanitizedTitle = match.officialTrack.title.replace(/[<>:"/\\|?*]/g, '_');
    return `${trackNumber} - ${sanitizedTitle}.mp3`;
  }

  return `${String(fallbackIndex).padStart(2, '0')} - Unknown Track.mp3`;
}
