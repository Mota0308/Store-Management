import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

const uploadDir = path.join(process.cwd(), 'server', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '');
    cb(null, `${base}-${Date.now()}${ext}`);
  }
});

const uploader = multer({ storage });

router.post('/', uploader.single('image'), (req, res) => {
  const file = (req as any).file as Express.Multer.File;
  if (!file) return res.status(400).json({ message: 'No file' });
  const url = `/uploads/${file.filename}`;
  res.json({ url });
});

export default router; 