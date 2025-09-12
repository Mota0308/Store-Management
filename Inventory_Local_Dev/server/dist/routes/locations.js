"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Location_1 = __importDefault(require("../models/Location"));
const router = (0, express_1.Router)();
// list
router.get('/', async (_req, res) => {
    const locations = await Location_1.default.find().sort({ name: 1 });
    res.json(locations);
});
// add
router.post('/', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name)
            return res.status(400).json({ message: 'name required' });
        const loc = await Location_1.default.create({ name });
        res.status(201).json(loc);
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to create location', error: String(e) });
    }
});
exports.default = router;
