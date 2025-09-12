"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const router = (0, express_1.Router)();
const uploadDir = path_1.default.join(process.cwd(), 'server', 'uploads');
if (!fs_1.default.existsSync(uploadDir))
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        const base = path_1.default.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '');
        cb(null, `${base}-${Date.now()}${ext}`);
    }
});
const uploader = (0, multer_1.default)({ storage });
router.post('/', uploader.single('image'), (req, res) => {
    const file = req.file;
    if (!file)
        return res.status(400).json({ message: 'No file' });
    const url = `/uploads/${file.filename}`;
    res.json({ url });
});
exports.default = router;
