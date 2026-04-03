import ffmpeg from 'fluent-ffmpeg';
import { parseFile } from 'music-metadata';
import { promisify } from 'util';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import config from './config.js';
import logger from './logger.js';

const execAsync = promisify(exec);

export async function getAudioDuration(filePath) {
  const metadata = await parseFile(filePath);
  return metadata.format.duration;
}

export async function detectSilences(filePath) {
  return new Promise((resolve, reject) => {
    const silences = [];
    const threshold = config.audio.silenceThreshold;
    const duration = config.audio.minSilenceDuration;

    logger.info({ filePath, threshold, duration }, 'Detecting silences');

    ffmpeg(filePath)
      .audioFilters(`silencedetect=n=${threshold}dB:d=${duration}`)
      .outputFormat('null')
      .on('stderr', (stderrLine) => {
        // Parse silence detection output
        const silenceStartMatch = stderrLine.match(/silence_start: ([\d.]+)/);
        const silenceEndMatch = stderrLine.match(/silence_end: ([\d.]+)/);

        if (silenceStartMatch) {
          silences.push({ start: parseFloat(silenceStartMatch[1]) });
        }
        if (silenceEndMatch && silences.length > 0) {
          const lastSilence = silences[silences.length - 1];
          if (!lastSilence.end) {
            lastSilence.end = parseFloat(silenceEndMatch[1]);
            lastSilence.duration = lastSilence.end - lastSilence.start;
          }
        }
      })
      .on('end', () => {
        logger.info({ silenceCount: silences.length }, 'Silence detection complete');
        resolve(silences);
      })
      .on('error', (err) => {
        logger.error({ error: err.message }, 'Silence detection failed');
        reject(err);
      })
      .save('-');
  });
}

export async function analyzeLoudness(filePath) {
  try {
    logger.info({ filePath }, 'Analyzing loudness');

    const { stdout } = await execAsync(
      `ffmpeg -i "${filePath}" -af "astats=metadata=1:reset=1" -f null - 2>&1 | grep "RMS level dB"`
    );

    const rmsValues = [];
    const lines = stdout.split('\n');

    for (const line of lines) {
      const match = line.match(/RMS level dB: ([-\d.]+)/);
      if (match) {
        rmsValues.push(parseFloat(match[1]));
      }
    }

    return rmsValues;
  } catch (error) {
    logger.warn({ error: error.message }, 'Loudness analysis failed, using silence detection');
    return [];
  }
}

export async function findQuietSections(filePath, duration) {
  logger.info({ filePath }, 'Finding quiet sections for live album');

  const segmentDuration = 1; // Analyze 1-second segments
  const segments = [];

  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .audioFilters('astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level')
      .outputFormat('null')
      .on('stderr', (stderrLine) => {
        const match = stderrLine.match(/pts_time:([\d.]+).*?lavfi\.astats\.Overall\.RMS_level=([-\d.]+)/);
        if (match) {
          segments.push({
            time: parseFloat(match[1]),
            rms: parseFloat(match[2])
          });
        }
      })
      .on('end', () => {
        if (segments.length === 0) {
          logger.warn('No loudness data collected');
          resolve([]);
          return;
        }

        // Calculate percentile threshold
        const sortedRms = segments.map(s => s.rms).sort((a, b) => a - b);
        const percentileIndex = Math.floor(sortedRms.length * (config.audio.liveAlbumMode.quietPercentile / 100));
        const threshold = sortedRms[percentileIndex];

        logger.info({ threshold, segmentCount: segments.length }, 'Calculated quiet threshold');

        // Find continuous quiet sections
        const quietSections = [];
        let currentSection = null;

        for (const segment of segments) {
          if (segment.rms <= threshold) {
            if (!currentSection) {
              currentSection = { start: segment.time };
            }
          } else {
            if (currentSection) {
              currentSection.end = segment.time;
              currentSection.duration = currentSection.end - currentSection.start;
              if (currentSection.duration >= config.audio.minSilenceDuration) {
                quietSections.push(currentSection);
              }
              currentSection = null;
            }
          }
        }

        logger.info({ quietSectionCount: quietSections.length }, 'Found quiet sections');
        resolve(quietSections);
      })
      .on('error', (err) => {
        logger.error({ error: err.message }, 'Quiet section detection failed');
        reject(err);
      })
      .save('-');
  });
}

export async function splitAudioFile(filePath, splits, outputDir) {
  const tracks = [];
  const basename = path.basename(filePath, path.extname(filePath));

  logger.info({ filePath, splitCount: splits.length }, 'Splitting audio file');

  for (let i = 0; i < splits.length; i++) {
    const split = splits[i];
    const outputPath = path.join(outputDir, `${basename}_track_${String(i + 1).padStart(2, '0')}.mp3`);

    await new Promise((resolve, reject) => {
      const command = ffmpeg(filePath)
        .seekInput(split.start)
        .audioCodec('libmp3lame')
        .audioBitrate('320k');

      if (split.duration) {
        command.duration(split.duration);
      }

      command
        .on('end', () => {
          logger.info({ track: i + 1, outputPath }, 'Track split complete');
          resolve();
        })
        .on('error', (err) => {
          logger.error({ error: err.message, track: i + 1 }, 'Track split failed');
          reject(err);
        })
        .save(outputPath);
    });

    tracks.push({
      index: i,
      path: outputPath,
      start: split.start,
      duration: split.duration || (splits[i + 1] ? splits[i + 1].start - split.start : null)
    });
  }

  return tracks;
}

export async function processAlbumSide(filePath, outputDir) {
  const duration = await getAudioDuration(filePath);
  logger.info({ filePath, duration }, 'Processing album side');

  // First try regular silence detection
  let silences = await detectSilences(filePath);

  // If no silences found or very few, try live album mode
  if (silences.length < 2) {
    logger.info('Few silences detected, trying live album mode');
    silences = await findQuietSections(filePath, duration);
  }

  if (silences.length === 0) {
    logger.warn('No split points found, treating as single track');
    return [{
      index: 0,
      path: filePath,
      start: 0,
      duration: duration
    }];
  }

  // Convert silences to split points
  const splits = [];
  splits.push({ start: 0 }); // First track starts at beginning

  for (const silence of silences) {
    const midPoint = (silence.start + (silence.end || silence.start)) / 2;
    splits.push({ start: midPoint });
  }

  // Calculate durations
  for (let i = 0; i < splits.length; i++) {
    if (i < splits.length - 1) {
      splits[i].duration = splits[i + 1].start - splits[i].start;
    } else {
      splits[i].duration = duration - splits[i].start;
    }
  }

  // Filter out tracks that are too short
  const validSplits = splits.filter(s => s.duration >= config.audio.minTrackLength);

  logger.info({ totalTracks: validSplits.length }, 'Split points identified');

  return await splitAudioFile(filePath, validSplits, outputDir);
}
