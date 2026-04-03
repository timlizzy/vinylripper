import fs from 'fs/promises';
import path from 'path';
import { processAlbumSide } from './audioProcessor.js';
import { getAlbumMetadata } from './musicbrainz.js';
import { matchTracks, generateTrackName } from './trackMatcher.js';
import logger from './logger.js';

export async function ripVinylAlbum(sides, artist, album) {
  const startTime = Date.now();
  logger.info({ artist, album, sideCount: sides.length }, 'Starting vinyl rip process');

  try {
    // Create temporary directory for processing
    const tempDir = path.join('output', 'temp', `${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Process each side and collect all tracks
    const allTracks = [];

    for (let i = 0; i < sides.length; i++) {
      const side = sides[i];
      logger.info({ side: side.label, file: side.file }, 'Processing side');

      const tracks = await processAlbumSide(side.path, tempDir);
      allTracks.push(...tracks);
    }

    logger.info({ totalTracks: allTracks.length }, 'All sides processed');

    // Fetch album metadata from MusicBrainz
    let metadata = null;
    try {
      metadata = await getAlbumMetadata(artist, album);
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to fetch metadata, proceeding without matching');
    }

    // Match tracks if metadata is available
    let matches = [];
    if (metadata && metadata.tracks.length > 0) {
      matches = matchTracks(allTracks, metadata.tracks);
    } else {
      // Create unmatched entries
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
      duration
    };
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Vinyl rip failed');
    throw error;
  }
}
