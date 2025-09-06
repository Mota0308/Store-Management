import { Router } from 'express';
import multer from 'multer';
import pdf from 'pdf-parse';
import Product from '../models/Product';
import mongoose from 'mongoose';

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { getDocument } = pdfjsLib;

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function normalizeCode(s: string) {
  return (s || '').replace(/[—–‑–−]/g, '-').replace(/[^A-Za-z0-9_\/-]/g, '').toUpperCase();
}

function codeVariants(raw: string): string[] {
  const n = normalizeCode(raw);
  const variants = new Set<string>();
  if (n) variants.add(n);
  
  // 提取基礎型號（如 WS-409PBK/LB → WS-409）
  const baseMatch = n.match(/^([A-Z]+[\-—–‑–−]?\d+)/);
  if (baseMatch) {
    variants.add(baseMatch[1]);
  }
  
  // 新增：處理去掉最後一個字符的情況（WS-409PBK/LB → WS-409PBK/L）
  if (n.length > 1) {
    variants.add(n.slice(0, -1));
  }
  
  // 新增：處理去掉最後兩個字符的情況（WS-409PBK/LB → WS-409PBK/）
  if (n.length > 2) {
    variants.add(n.slice(0, -2));
  }
  
  // 新增：處理去掉斜線後面的部分（WS-409PBK/LB → WS-409PBK）
  const slashIndex = n.lastIndexOf('/');
  if (slashIndex > 0) {
    variants.add(n.substring(0, slashIndex));
  }
  
  // 原有邏輯
  const m = n.match(/^([A-Z]+)_?(\d+)$/);
  if (m) variants.add(`${m[1]}-${m[2]}`);
  if (n) variants.add(n.replace(/-/g, ''));
  
  return Array.from(variants).filter(Boolean);
}

const codePattern = /(?:[A-Z]{1,8}[\-—–‑–−]?\d{2,8}[A-Za-z\/]*)|(?:\b\d{8,14}\b)/;

function byY(a: any, b: any) { return a.transform[5] - b.transform[5]; }
function byX(a: any, b: any) { return a.transform[4] - b.transform[4]; }

async function extractByPdfjs(buffer: Buffer): Promise<{ name: string; code: string; qty: number }[]> {
  const loadingTask = getDocument({
    data: buffer,
    disableWorker: true,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;
  const rows: { name: string; code: string; qty: number }[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as any[];
    items.sort(byY);

    const lines: any[][] = [];
    const yTolerance = 2.5;
    for (const it of items) {
      const y = it.transform[5];
      const line = lines.find(L => Math.abs((L as any)._y - y) <= yTolerance);
      if (line) { line.push(it); (line as any)._y = ((line as any)._y + y) / 2; }
      else { const L: any[] = [it]; (L as any)._y = y; lines.push(L); }
    }

    let nameX: [number, number] | null = null;
    let codeX: [number, number] | null = null;
    let qtyX: [number, number] | null = null;

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
          codeX = codeHead ? [codeHead.x - 2, qtyHead.x - 2] : null as any;
          // 放寬數量欄寬，避免長數字被截斷
          qtyX = [qtyHead.x - 2, qtyHead.x + 260];
        }
        break;
      }
    }

    if (!nameX || !qtyX) continue;

    const headerIndex = lines.findIndex(L => {
      const t = L.map((t: any) => t.str).join('');
      return /(商品詳情|產品描述|商品描述|商品名稱|品名)/.test(t) && /(數量|數目|總共數量|庫存數量)/.test(t);
    });
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const L = lines[i].slice().sort(byX);
      const lineText = L.map((t: any) => t.str).join('').trim();
      if (!lineText || /小計|合計|金額|備註|--END--/i.test(lineText)) break;

      const inRange = (x: number, R: [number, number]) => x >= R[0] && x < R[1];
      const pick = (R: [number, number]) => L.filter(t => inRange(t.transform[4], R)).map((t: any) => t.str).join('').trim();

      const name = pick(nameX);
      const codeText = codeX ? pick(codeX) : '';
      const qtyText = pick(qtyX);

      // 型號可出現在型號列或商品詳情列內文中
      const codeSource = `${codeText} ${name}`.trim();
      const codeMatch = codeSource.match(codePattern);
      // 數量允許更大位數（最多5位），且優先取數量欄位的第一個整數
      const qtyMatch = qtyText.match(/\b(\d{1,5})\b/);
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 0;
      if (codeMatch && qty > 0) rows.push({ name, code: codeMatch[0], qty });
    }
  }

  try { await (doc as any).destroy(); } catch {}
  return rows;
}

async function updateByCodeVariants(rawCode: string, qty: number, locationId: string, summary: any, direction: 'out' | 'in') {
  console.log(`調試: 原始代碼 "${rawCode}" -> 變體:`, codeVariants(rawCode));
  const variants = codeVariants(rawCode);
  if (variants.length === 0) return;
  const product = await Product.findOne({ productCode: { $in: variants } });
  console.log(`調試: 查詢結果:`, product ? `找到產品 ${product.productCode}` : '未找到產品');
  if (!product) { summary.notFound.push(normalizeCode(rawCode)); return; }

router.post('/outgoing', upload.array('files'), async (req, res) => {
  try {
    const { locationId } = req.body as any;
    if (!locationId) return res.status(400).json({ message: 'locationId required' });
    const files = (req.files as Express.Multer.File[]) || [];

    const summary = { files: files.length, matched: 0, updated: 0, notFound: [] as string[], parsed: [] as any[] };

    for (const f of files) {
      let rows: { name: string; code: string; qty: number }[] = [];
      try { rows = await extractByPdfjs(f.buffer); } catch {}
      if (rows.length === 0) {
        const data = await pdf(f.buffer);
        const text = data.text;
        if (text) {
          const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
          for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(codePattern);
            if (!m) continue;
            for (let j = i; j <= i + 6 && j < lines.length; j++) {
              const q = lines[j].match(/\b(\d{1,5})\b/);
              if (q) { rows.push({ name: lines[i - 1] || '', code: m[0], qty: parseInt(q[1], 10) }); break; }
            }
          }
        }
      }

      summary.parsed.push(rows.map(r => ({ name: r.name, code: normalizeCode(r.code), qty: r.qty })));
      for (const r of rows) await updateByCodeVariants(r.code, r.qty, locationId, summary, 'out');
    }

    res.json(summary);
  } catch (e) {
    res.status(500).json({ message: 'Failed to import outgoing', error: String(e) });
  }
});

router.post('/incoming', upload.array('files'), async (req, res) => {
  try {
    console.log('調試: 收到進貨請求');
    const { locationId } = req.body as any;
    console.log('調試: locationId =', locationId);
    if (!locationId) return res.status(400).json({ message: 'locationId required' });
    const files = (req.files as Express.Multer.File[]) || [];
    console.log('調試: 收到文件數量 =', files.length);

    const summary = { files: files.length, matched: 0, updated: 0, notFound: [] as string[], parsed: [] as any[] };

    for (const f of files) {
      let rows: { name: string; code: string; qty: number }[] = [];
      try { rows = await extractByPdfjs(f.buffer); } catch {}
      if (rows.length === 0) {
        const data = await pdf(f.buffer);
        const text = data.text;
        if (text) {
          const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
          for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(codePattern);
            if (!m) continue;
            for (let j = i; j <= i + 6 && j < lines.length; j++) {
              const q = lines[j].match(/\b(\d{1,5})\b/);
              if (q) { rows.push({ name: lines[i - 1] || '', code: m[0], qty: parseInt(q[1], 10) }); break; }
            }
          }
        }
      }

      console.log(`調試: 從 PDF 提取到 ${rows.length} 行數據:`, rows);
summary.parsed.push(rows.map(r => ({ name: r.name, code: normalizeCode(r.code), qty: r.qty })));
for (const r of rows) {
  console.log(`調試: 處理行數據:`, r);
  await updateByCodeVariants(r.code, r.qty, locationId, summary, 'in');
}
    }

    res.json(summary);
  } catch (e) {
    res.status(500).json({ message: 'Failed to import incoming', error: String(e) });
  }
});

export default router; }