"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const xlsx_1 = __importDefault(require("xlsx"));
const mongoose_1 = __importDefault(require("mongoose"));
const Product_1 = __importDefault(require("../models/Product"));
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { getDocument } = pdfjsLib;
const router = express_1.default.Router();
// 配置multer使用內存存儲
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB限制
});
// 輔助函數
function normalizeCode(s) {
    return (s || '').replace(/[—–‑–−]/g, '-').replace(/[^A-Za-z0-9_\/-]/g, '').toUpperCase();
}
function codeVariants(raw) {
    const n = normalizeCode(raw);
    if (!n)
        return [];
    const variants = [n];
    if (n.includes('-')) {
        variants.push(n.replace(/-/g, ''));
        variants.push(n.replace(/-/g, '—'));
        variants.push(n.replace(/-/g, '–'));
    }
    return [...new Set(variants)];
}
const codePattern = /(?:[A-Z]{1,8}[\-—–‑–−]?\d{2,8}(?:[A-Z]+)?(?:\/[A-Z]+)?)|(?:\b\d{8,14}\b)/;
// 修改：同時提取購買類型和尺寸信息
function extractPurchaseTypeAndSize(text) {
    // 匹配購買類型模式
    const purchaseTypePatterns = [
        /購買類型[：:]\s*([^，,\s]+)/,
        /購買類型[：:]\s*([^，,\s]+)/,
        /類型[：:]\s*([^，,\s]+)/,
        /(上衣|褲子|套裝)/,
        /(Top|Bottom|Set)/i
    ];
    // 匹配尺寸模式
    const sizePatterns = [
        /尺寸[：:]\s*([^，,\s]+)/,
        /尺碼[：:]\s*([^，,\s]+)/,
        /Size[：:]\s*([^，,\s]+)/i,
        /\b(\d+)\b/ // 匹配數字作為尺寸
    ];
    let purchaseType;
    let size;
    for (const pattern of purchaseTypePatterns) {
        const match = text.match(pattern);
        if (match) {
            const type = match[1] || match[0];
            // 標準化購買類型
            if (type.includes('上衣') || type.toLowerCase().includes('top')) {
                purchaseType = '上衣';
                break;
            }
            if (type.includes('褲子') || type.toLowerCase().includes('bottom')) {
                purchaseType = '褲子';
                break;
            }
            if (type.includes('套裝') || type.toLowerCase().includes('set')) {
                purchaseType = '套裝';
                break;
            }
        }
    }
    for (const pattern of sizePatterns) {
        const match = text.match(pattern);
        if (match) {
            size = match[1];
            break;
        }
    }
    return { purchaseType, size };
}
// 修改：WS-712系列商品的特殊匹配函數
async function updateWS712Product(rawCode, qty, locationId, summary, direction, purchaseType, size) {
    const variants = codeVariants(rawCode);
    if (variants.length === 0)
        return;
    // 查找所有匹配的WS-712產品
    const products = await Product_1.default.find({ productCode: { $in: variants } });
    if (products.length === 0) {
        summary.notFound.push(normalizeCode(rawCode));
        return;
    }
    // 如果沒有指定購買類型和尺寸，使用原來的邏輯
    if (!purchaseType || !size) {
        const product = products[0]; // 取第一個匹配的產品
        summary.matched++;
        const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
        if (inv)
            inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
        else
            product.inventories.push({ locationId: new mongoose_1.default.Types.ObjectId(locationId), quantity: direction === 'out' ? 0 : qty });
        await product.save();
        summary.updated++;
        return;
    }
    // 根據購買類型和尺寸匹配產品
    let matchedProduct = null;
    for (const product of products) {
        // 檢查產品的尺寸是否匹配
        const hasMatchingSize = product.sizes.some(productSize => {
            // 支持兩種格式：{上衣 | 1} 和 {1 | 上衣}
            const sizeStr = productSize.replace(/[{}]/g, ''); // 移除大括號
            const parts = sizeStr.split('|').map(p => p.trim());
            // 檢查是否包含購買類型和尺寸
            const hasPurchaseType = parts.some(part => part.includes(purchaseType));
            const hasSize = parts.some(part => part.includes(size));
            return hasPurchaseType && hasSize;
        });
        if (hasMatchingSize) {
            matchedProduct = product;
            break;
        }
    }
    if (!matchedProduct) {
        summary.notFound.push(`${normalizeCode(rawCode)} (${purchaseType}, 尺寸: ${size})`);
        return;
    }
    summary.matched++;
    const inv = matchedProduct.inventories.find(i => String(i.locationId) === String(locationId));
    if (inv)
        inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
    else
        matchedProduct.inventories.push({ locationId: new mongoose_1.default.Types.ObjectId(locationId), quantity: direction === 'out' ? 0 : qty });
    await matchedProduct.save();
    summary.updated++;
}
// 修改：更新函數調用
async function updateByCodeVariants(rawCode, qty, locationId, summary, direction, purchaseType, size) {
    // 檢查是否為WS-712系列商品
    if (rawCode.includes('WS-712')) {
        await updateWS712Product(rawCode, qty, locationId, summary, direction, purchaseType, size);
        return;
    }
    // 其他商品使用原來的邏輯
    const variants = codeVariants(rawCode);
    if (variants.length === 0)
        return;
    const product = await Product_1.default.findOne({ productCode: { $in: variants } });
    if (!product) {
        summary.notFound.push(normalizeCode(rawCode));
        return;
    }
    summary.matched++;
    const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
    if (inv)
        inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
    else
        product.inventories.push({ locationId: new mongoose_1.default.Types.ObjectId(locationId), quantity: direction === 'out' ? 0 : qty });
    await product.save();
    summary.updated++;
}
// 修改：PDF解析函數，支持提取尺寸信息
async function extractByPdfjs(buffer) {
    const loadingTask = getDocument({
        data: buffer,
        disableWorker: true,
        disableFontFace: true,
        isEvalSupported: false,
        useSystemFonts: true,
    });
    const doc = await loadingTask.promise;
    const rows = [];
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const items = content.items;
        items.sort(byY);
        const lines = [];
        const yTolerance = 2.5;
        for (const it of items) {
            const y = it.transform[5];
            const line = lines.find(L => Math.abs(L._y - y) <= yTolerance);
            if (line) {
                line.push(it);
                line._y = (line._y + y) / 2;
            }
            else {
                const L = [it];
                L._y = y;
                lines.push(L);
            }
        }
        let nameX = null;
        let codeX = null;
        let qtyX = null;
        for (const L of lines) {
            const text = L.map(t => t.str).join('');
            // Expanded header synonyms based on provided PDF formats
            const nameHeadRegex = /(商品詳情|產品描述|商品描述|商品名稱|品名)/;
            const codeHeadRegex = /(型號|條碼號碼|條碼|條形碼|條碼編號|型號編號|貨號)/;
            const qtyHeadRegex = /(數量|數目|總共數量|庫存數量)/;
            const hasNameHead = nameHeadRegex.test(text);
            const hasCodeHead = codeHeadRegex.test(text);
            const hasQtyHead = qtyHeadRegex.test(text);
            if ((hasNameHead && hasQtyHead) && (hasCodeHead || true)) {
                L.sort(byX);
                const parts = L.map(t => ({ x: t.transform[4], s: t.str }));
                const nameHead = parts.find(p => nameHeadRegex.test(p.s));
                const codeHead = parts.find(p => codeHeadRegex.test(p.s));
                const qtyHead = parts.find(p => qtyHeadRegex.test(p.s));
                if (nameHead && qtyHead) {
                    // If 型號列缺失，codeX 可為 null，稍後從 name 中提取
                    nameX = [nameHead.x - 2, (codeHead ? codeHead.x : qtyHead.x) - 2];
                    codeX = codeHead ? [codeHead.x - 2, qtyHead.x - 2] : null;
                    // 放寬數量欄寬，避免長數字被截斷
                    qtyX = [qtyHead.x - 2, qtyHead.x + 260];
                }
                break;
            }
        }
        if (!nameX || !qtyX)
            continue;
        const headerIndex = lines.findIndex(L => {
            const t = L.map((t) => t.str).join('');
            return /(商品詳情|產品描述|商品描述|商品名稱|品名)/.test(t) && /(數量|數目|總共數量|庫存數量)/.test(t);
        });
        for (let i = headerIndex + 1; i < lines.length; i++) {
            const L = lines[i].slice().sort(byX);
            const lineText = L.map((t) => t.str).join('').trim();
            if (!lineText || /小計|合計|金額|備註|--END--/i.test(lineText))
                break;
            const inRange = (x, R) => x >= R[0] && x < R[1];
            const pick = (R) => L.filter(t => inRange(t.transform[4], R)).map((t) => t.str).join('').trim();
            const name = pick(nameX);
            const codeText = codeX ? pick(codeX) : '';
            const qtyText = pick(qtyX);
            // 型號可出現在型號列或商品詳情列內文中
            const codeSource = `${codeText} ${name}`.trim();
            const codeMatch = codeSource.match(codePattern);
            // 數量允許更大位數（最多5位），且優先取數量欄位的第一個整數
            const qtyMatch = qtyText.match(/\b(\d{1,5})\b/);
            const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 0;
            if (codeMatch && qty > 0) {
                // 提取購買類型和尺寸
                const { purchaseType, size } = extractPurchaseTypeAndSize(lineText);
                rows.push({ name, code: codeMatch[0], qty, purchaseType, size });
            }
        }
    }
    try {
        await doc.destroy();
    }
    catch { }
    return rows;
}
// 輔助函數
function byY(a, b) { return b.transform[5] - a.transform[5]; }
function byX(a, b) { return a.transform[4] - b.transform[4]; }
// 進貨功能
router.post('/incoming', upload.array('files'), async (req, res) => {
    try {
        console.log('調試: 收到進貨請求');
        const { locationId } = req.body;
        const files = req.files;
        console.log('調試: locationId =', locationId);
        console.log('調試: 收到文件數量 =', files?.length || 0);
        if (!locationId) {
            return res.status(400).json({ message: 'Missing locationId' });
        }
        if (!files || files.length === 0) {
            return res.status(400).json({ message: 'Missing files' });
        }
        const summary = {
            files: files.length,
            processed: 0,
            matched: 0,
            created: 0,
            updated: 0,
            notFound: [],
            parsed: [],
            errors: []
        };
        for (const file of files) {
            try {
                let rows = [];
                try {
                    rows = await extractByPdfjs(file.buffer);
                }
                catch (pdfjsError) {
                    console.log('PDF.js 解析失敗，嘗試使用 pdf-parse:', pdfjsError);
                }
                if (rows.length === 0) {
                    const data = await (0, pdf_parse_1.default)(file.buffer);
                    const text = data.text;
                    if (text) {
                        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                        for (let i = 0; i < lines.length; i++) {
                            const m = lines[i].match(codePattern);
                            if (m) {
                                const qtyMatch = lines[i].match(/\b(\d{1,5})\b/);
                                const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 0;
                                if (qty > 0) {
                                    const { purchaseType, size } = extractPurchaseTypeAndSize(lines[i]);
                                    rows.push({ name: '', code: m[0], qty, purchaseType, size });
                                }
                            }
                        }
                    }
                }
                summary.parsed.push(...rows);
                summary.processed += rows.length;
                for (const row of rows) {
                    await updateByCodeVariants(row.code, row.qty, locationId, summary, 'in', row.purchaseType, row.size);
                }
            }
            catch (error) {
                console.error('處理文件時出錯:', error);
                summary.errors.push(`文件處理錯誤: ${error}`);
            }
        }
        console.log('調試: 處理完成，摘要:', summary);
        res.json({ message: '進貨處理完成', summary });
    }
    catch (error) {
        console.error('進貨處理錯誤:', error);
        res.status(500).json({
            message: '進貨處理失敗',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});
// 出貨功能
router.post('/outgoing', upload.array('files'), async (req, res) => {
    try {
        console.log('調試: 收到出貨請求');
        const { locationId } = req.body;
        const files = req.files;
        console.log('調試: locationId =', locationId);
        console.log('調試: 收到文件數量 =', files?.length || 0);
        if (!locationId) {
            return res.status(400).json({ message: 'locationId required' });
        }
        if (!files || files.length === 0) {
            return res.status(400).json({ message: 'Missing files' });
        }
        const summary = {
            files: files.length,
            processed: 0,
            matched: 0,
            created: 0,
            updated: 0,
            notFound: [],
            parsed: [],
            errors: []
        };
        for (const file of files) {
            try {
                let rows = [];
                try {
                    rows = await extractByPdfjs(file.buffer);
                }
                catch (pdfjsError) {
                    console.log('PDF.js 解析失敗，嘗試使用 pdf-parse:', pdfjsError);
                }
                if (rows.length === 0) {
                    const data = await (0, pdf_parse_1.default)(file.buffer);
                    const text = data.text;
                    if (text) {
                        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                        for (let i = 0; i < lines.length; i++) {
                            const m = lines[i].match(codePattern);
                            if (m) {
                                const qtyMatch = lines[i].match(/\b(\d{1,5})\b/);
                                const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 0;
                                if (qty > 0) {
                                    const { purchaseType, size } = extractPurchaseTypeAndSize(lines[i]);
                                    rows.push({ name: '', code: m[0], qty, purchaseType, size });
                                }
                            }
                        }
                    }
                }
                summary.parsed.push(...rows);
                summary.processed += rows.length;
                for (const row of rows) {
                    await updateByCodeVariants(row.code, row.qty, locationId, summary, 'out', row.purchaseType, row.size);
                }
            }
            catch (error) {
                console.error('處理文件時出錯:', error);
                summary.errors.push(`文件處理錯誤: ${error}`);
            }
        }
        console.log('調試: 處理完成，摘要:', summary);
        // 返回更新後的產品列表
        const products = await Product_1.default.find().populate('inventories.locationId');
        res.json({ message: '出貨處理完成', summary, products });
    }
    catch (error) {
        console.error('出貨處理錯誤:', error);
        res.status(500).json({
            message: '出貨處理失敗',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});
// 門市對調功能
router.post('/transfer', upload.array('files'), async (req, res) => {
    try {
        console.log('調試: 收到門市對調請求');
        const { fromLocationId, toLocationId } = req.body;
        const files = req.files;
        console.log('調試: fromLocationId =', fromLocationId);
        console.log('調試: toLocationId =', toLocationId);
        console.log('調試: 收到文件數量 =', files?.length || 0);
        if (!fromLocationId || !toLocationId) {
            return res.status(400).json({ message: 'Missing fromLocationId or toLocationId' });
        }
        if (!files || files.length === 0) {
            return res.status(400).json({ message: 'Missing files' });
        }
        const summary = {
            files: files.length,
            processed: 0,
            matched: 0,
            created: 0,
            updated: 0,
            notFound: [],
            parsed: [],
            errors: []
        };
        for (const file of files) {
            try {
                let rows = [];
                try {
                    rows = await extractByPdfjs(file.buffer);
                }
                catch (pdfjsError) {
                    console.log('PDF.js 解析失敗，嘗試使用 pdf-parse:', pdfjsError);
                }
                if (rows.length === 0) {
                    const data = await (0, pdf_parse_1.default)(file.buffer);
                    const text = data.text;
                    if (text) {
                        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                        for (let i = 0; i < lines.length; i++) {
                            const m = lines[i].match(codePattern);
                            if (m) {
                                const qtyMatch = lines[i].match(/\b(\d{1,5})\b/);
                                const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 0;
                                if (qty > 0) {
                                    const { purchaseType, size } = extractPurchaseTypeAndSize(lines[i]);
                                    rows.push({ name: '', code: m[0], qty, purchaseType, size });
                                }
                            }
                        }
                    }
                }
                summary.parsed.push(...rows);
                summary.processed += rows.length;
                for (const row of rows) {
                    // 先從源倉庫減少
                    await updateByCodeVariants(row.code, row.qty, fromLocationId, summary, 'out', row.purchaseType, row.size);
                    // 再增加到目標倉庫
                    await updateByCodeVariants(row.code, row.qty, toLocationId, summary, 'in', row.purchaseType, row.size);
                }
            }
            catch (error) {
                console.error('處理文件時出錯:', error);
                summary.errors.push(`文件處理錯誤: ${error}`);
            }
        }
        console.log('調試: 處理完成，摘要:', summary);
        res.json({ message: '門市對調處理完成', summary });
    }
    catch (error) {
        console.error('門市對調處理錯誤:', error);
        res.status(500).json({
            message: '門市對調處理失敗',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});
// Excel導入功能
router.post('/excel', upload.array('files'), async (req, res) => {
    try {
        console.log('調試: 收到Excel導入請求');
        const { locationId } = req.body;
        const files = req.files;
        console.log('調試: locationId =', locationId);
        console.log('調試: 收到文件數量 =', files?.length || 0);
        if (!locationId) {
            return res.status(400).json({ message: 'Missing locationId' });
        }
        if (!files || files.length === 0) {
            return res.status(400).json({ message: 'Missing files' });
        }
        const summary = {
            files: files.length,
            processed: 0,
            matched: 0,
            created: 0,
            updated: 0,
            notFound: [],
            parsed: [],
            errors: []
        };
        for (const file of files) {
            try {
                const workbook = xlsx_1.default.read(file.buffer);
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const data = xlsx_1.default.utils.sheet_to_json(worksheet);
                const rows = [];
                for (const row of data) {
                    const code = row['型號'] || row['條碼'] || row['商品代碼'] || '';
                    const qty = parseInt(row['數量'] || row['庫存'] || '0', 10);
                    const name = row['商品名稱'] || row['品名'] || '';
                    if (code && qty > 0) {
                        const { purchaseType, size } = extractPurchaseTypeAndSize(JSON.stringify(row));
                        rows.push({ name, code, qty, purchaseType, size });
                    }
                }
                summary.parsed.push(...rows);
                summary.processed += rows.length;
                for (const row of rows) {
                    await updateByCodeVariants(row.code, row.qty, locationId, summary, 'in', row.purchaseType, row.size);
                }
            }
            catch (error) {
                console.error('處理文件時出錯:', error);
                summary.errors.push(`文件處理錯誤: ${error}`);
            }
        }
        console.log('調試: 處理完成，摘要:', summary);
        res.json({ message: 'Excel導入處理完成', summary });
    }
    catch (error) {
        console.error('Excel導入處理錯誤:', error);
        res.status(500).json({
            message: 'Excel導入處理失敗',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});
// 清零功能
router.post('/clear-all', async (req, res) => {
    try {
        console.log('調試: 收到清零請求');
        // 將所有產品的庫存設為0
        await Product_1.default.updateMany({}, { $set: { 'inventories.$[].quantity': 0 } });
        console.log('調試: 清零完成');
        res.json({ message: '所有庫存已清零' });
    }
    catch (error) {
        console.error('清零處理錯誤:', error);
        res.status(500).json({
            message: '清零處理失敗',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});
exports.default = router;
