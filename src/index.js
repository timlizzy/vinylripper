import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import config from './config.js';
import logger from './logger.js';
import { ripVinylAlbum } from './vinylRipper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: config.upload.maxFileSize
  },
  fileFilter: (req, file, cb) => {
    if (config.upload.allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP3 files are allowed.'));
    }
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Main ripping endpoint
app.post('/api/rip', upload.fields([
  { name: 'sideA', maxCount: 1 },
  { name: 'sideB', maxCount: 1 },
  { name: 'sideC', maxCount: 1 },
  { name: 'sideD', maxCount: 1 }
]), async (req, res) => {
  const startTime = Date.now();

  try {
    const { artist, album } = req.body;

    if (!artist || !album) {
      return res.status(400).json({
        success: false,
        error: 'Artist and album fields are required'
      });
    }

    if (!req.files || !req.files.sideA || !req.files.sideB) {
      return res.status(400).json({
        success: false,
        error: 'At least sides A and B must be uploaded'
      });
    }

    logger.info({ artist, album }, 'Received rip request');

    // Prepare sides array
    const sides = [];
    const sideLabels = ['A', 'B', 'C', 'D'];

    for (const label of sideLabels) {
      const fieldName = `side${label}`;
      if (req.files[fieldName] && req.files[fieldName][0]) {
        sides.push({
          label,
          file: req.files[fieldName][0].originalname,
          path: req.files[fieldName][0].path
        });
      }
    }

    // Process the vinyl rip
    const result = await ripVinylAlbum(sides, artist, album);

    // Clean up uploaded files
    for (const side of sides) {
      try {
        await fs.unlink(side.path);
      } catch (error) {
        logger.warn({ path: side.path, error: error.message }, 'Failed to delete uploaded file');
      }
    }

    logger.info({ duration: Date.now() - startTime }, 'Request completed successfully');

    res.json(result);
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Request failed');

    // Clean up uploaded files on error
    if (req.files) {
      for (const field in req.files) {
        for (const file of req.files[field]) {
          try {
            await fs.unlink(file.path);
          } catch (err) {
            logger.warn({ path: file.path }, 'Failed to delete file after error');
          }
        }
      }
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File size exceeds the maximum limit'
      });
    }
  }

  logger.error({ error: err.message }, 'Unhandled error');

  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Start server
const PORT = config.port;

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Vinyl Ripper server started');
  console.log(`\n🎵 Vinyl Ripper is running!`);
  console.log(`\n📍 Open your browser to: http://localhost:${PORT}\n`);
});
