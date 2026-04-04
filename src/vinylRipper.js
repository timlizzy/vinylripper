import fs from 'fs/promises';
import path from 'path';
import { processAlbumSide } from './audioProcessor.js';
import { getAlbumMetadata } from './musicbrainz.js';
import { matchTracks, generateTrackName } from './trackMatcher.js';
import logger from './logger.js';

export async function ripVinylAlbum(sides, artist, album) {
  const startTime = Date.now();
  logger.info({ artist, album, sideCount: sides.length }, 'Starting vinyl rip process');

  const processingLog = [];

  try {
    // Create temporary directory for processing
    const tempDir = path.join('output', 'temp', `${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Process each side and collect tracks per side
    const sideResults = [];

    for (let i = 0; i < sides.length; i++) {
      const side = sides[i];
      logger.info({ side: side.label, file: side.file }, 'Processing side');
      processingLog.push({ type: 'heading', message: `Side ${side.label}: ${side.file}` });

      const result = await processAlbumSide(side.path, tempDir);
      const tracks = result.tracks || result;
      const sideLog = result.log || [];

      processingLog.push(...sideLog);
      processingLog.push({ type: 'info', message: `Side ${side.label}: ${tracks.length} track(s) detected` });
      
      sideResults.push({
        label: side.label,
        tracks: tracks
      });
    }

    // Collect all tracks in order
    const allTracks = sideResults.flatMap(sr => sr.tracks);
    logger.info({ totalTracks: allTracks.length }, 'All sides processed');
    processingLog.push({ type: 'heading', message: 'MusicBrainz Lookup' });

    // Fetch album metadata from MusicBrainz
    let metadata = null;
    try {
      metadata = await getAlbumMetadata(artist, album);
      if (metadata && metadata.log) {
        processingLog.push(...metadata.log);
      }
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to fetch metadata, proceeding without matching');
      if (error.log) {
        processingLog.push(...error.log);
      }
      processingLog.push({ type: 'error', message: `Metadata lookup failed: ${error.message}` });
    }

    // Match tracks if metadata is available
    let matches = [];
    processingLog.push({ type: 'heading', message: 'Track Matching' });

    if (metadata && metadata.tracks && metadata.tracks.length > 0) {
      // Try side-based matching: split the official track listing by detected side counts
      const officialTracks = metadata.tracks;
      const sideTrackCounts = sideResults.map(sr => sr.tracks.length);
      const totalDetected = sideTrackCounts.reduce((a, b) => a + b, 0);

      // Check if the MusicBrainz release has multiple media (sides already split)
      const hasMultipleMedia = metadata.mediaInfo && metadata.mediaInfo.length > 1;

      if (hasMultipleMedia && metadata.mediaInfo.length === sideResults.length) {
        // Media already split by side — match each side against its corresponding medium
        processingLog.push({ type: 'info', message: `Release has ${metadata.mediaInfo.length} media matching ${sideResults.length} sides — matching per side` });

        for (let i = 0; i < sideResults.length; i++) {
          const sideDetected = sideResults[i].tracks;
          const sideOfficial = metadata.mediaInfo[i].tracks;
          processingLog.push({ type: 'info', message: `Side ${sideResults[i].label}: ${sideDetected.length} detected vs ${sideOfficial.length} official` });

          const matchResult = matchTracks(sideDetected, sideOfficial);
          const sideMatches = matchResult.matches || matchResult;
          if (matchResult.log) {
            processingLog.push(...matchResult.log);
          }
          matches.push(...sideMatches);
        }
      } else if (!hasMultipleMedia && officialTracks.length >= totalDetected) {
        // Single medium — split official track list by detected side counts
        processingLog.push({
          type: 'info',
          message: `Single medium with ${officialTracks.length} tracks — splitting by detected side counts: ${sideTrackCounts.map((c, i) => `Side ${sideResults[i].label}=${c}`).join(', ')}`
        });

        let offset = 0;
        for (let i = 0; i < sideResults.length; i++) {
          const sideDetected = sideResults[i].tracks;
          const sideOfficialSlice = officialTracks.slice(offset, offset + sideDetected.length);

          processingLog.push({
            type: 'info',
            message: `Side ${sideResults[i].label}: matching ${sideDetected.length} detected track(s) against official tracks ${offset + 1}-${offset + sideDetected.length}`
          });

          // For side-based assignment, just assign tracks in order
          for (let j = 0; j < sideDetected.length; j++) {
            const officialTrack = sideOfficialSlice[j] || null;
            matches.push({
              detectedTrack: sideDetected[j],
              officialTrack: officialTrack,
              confidence: officialTrack ? 0.8 : 0,
              method: 'side-order'
            });
            if (officialTrack) {
              processingLog.push({
                type: 'success',
                message: `  Track ${offset + j + 1}: "${officialTrack.title}" (assigned by position on side ${sideResults[i].label})`
              });
            }
          }

          offset += sideDetected.length;
        }

        // If there are remaining official tracks not assigned, log it
        if (offset < officialTracks.length) {
          processingLog.push({
            type: 'warning',
            message: `${officialTracks.length - offset} official track(s) not assigned (detected fewer tracks than expected)`
          });
        }
      } else {
        // Fallback: match all tracks together
        processingLog.push({ type: 'info', message: `Falling back to matching all ${totalDetected} detected track(s) against ${officialTracks.length} official track(s)` });
        const matchResult = matchTracks(allTracks, officialTracks);
        matches = matchResult.matches || matchResult;
        if (matchResult.log) {
          processingLog.push(...matchResult.log);
        }
      }
    } else {
      // Create unmatched entries
      processingLog.push({ type: 'warning', message: 'No metadata available — all tracks will be saved as "Unknown Track"' });
      matches = allTracks.map(track => ({
        detectedTrack: track,
        officialTrack: null,
        confidence: 0
      }));
    }

    // Create output directory
    const sanitizedArtist = artist.replace(/[<>:"/\\|?*]/g, '_');
    const sanitizedAlbum = album.replace(/[<>:"/\\|?*]/g, '_');
    const outputDir = path.join('output', `${sanitizedArtist} - ${sanitizedAlbum}`);
    await fs.mkdir(outputDir, { recursive: true });

    // Move and rename files
    const results = [];
    processingLog.push({ type: 'heading', message: 'Output' });

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const newName = generateTrackName(match, i + 1);
      const newPath = path.join(outputDir, newName);

      await fs.rename(match.detectedTrack.path, newPath);

      results.push({
        trackNumber: i + 1,
        fileName: newName,
        duration: match.detectedTrack.duration,
        matched: match.officialTrack !== null,
        title: match.officialTrack?.title || 'Unknown',
        confidence: match.confidence
      });

      logger.info({ trackNumber: i + 1, fileName: newName }, 'Track saved');
    }

    processingLog.push({ type: 'success', message: `Saved ${results.length} track(s) to ${outputDir}` });

    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to clean up temp directory');
    }

    const duration = Date.now() - startTime;
    logger.info({ duration, trackCount: results.length, outputDir }, 'Vinyl rip complete');

    return {
      success: true,
      artist,
      album,
      outputDir,
      tracks: results,
      metadata: metadata?.release || null,
      processingLog,
      duration
    };
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Vinyl rip failed');
    processingLog.push({ type: 'error', message: `Processing failed: ${error.message}` });
    error.processingLog = processingLog;
    throw error;
  }
}