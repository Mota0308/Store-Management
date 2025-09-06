import { Router } from 'express';
import multer from 'multer';
import pdf from 'pdf-parse';
import Product from '../models/Product';
import mongoose from 'mongoose';

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { getDocument } = pdfjsLib;

const router = Router();

const upload = multer({ dest: 'uploads/' });

// 生成產品代碼的各種變體
function codeVariants(code: string): string[] {
  const variants = new Set<string>();
  variants.add(code);
  
  // 移除斜杠後的變體
  if (code.includes('/')) {
    variants.add(code.replace('/', ''));
  }
  
  // 移除連字符的變體
  if (code.includes('-')) {
    variants.add(code.replace(/-/g, ''));
  }
  
  // 部分匹配變體
  const parts = code.split(/[-/]/);
  if (parts.length > 1) {
    variants.add(parts[0]);
    variants.add(parts.slice(0, 2).join(''));
  }
  
  return Array.from(variants).filter(Boolean);
}

// 標準化產品代碼
function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// 更新庫存
async function updateByCodeVariants(code: string, qty: number, locationId: string, summary: any, mode: 'in' | 'out') {
  const variants = codeVariants(code);
  console.log(`調試: 查找產品代碼 "${code}" 的變體:`, variants);
  
  for (const variant of variants) {
    const products = await Product.find({ productCode: variant });
    console.log(`調試: 找到 ${products.length} 個匹配產品 (變體: ${variant})`);
    
    for (const product of products) {
      const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
      if (inv) {
        const oldQty = inv.quantity;
        if (mode === 'in') {
          inv.quantity += qty;
        } else {
          inv.quantity = Math.max(0, inv.quantity - qty);
        }
        await product.save();
        summary.updated++;
        console.log(`調試: 更新產品 "${product.name}" (${product.productCode}) 庫存: ${oldQty} -> ${inv.quantity}`);
      } else {
        if (mode === 'in') {
          product.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: qty });
          await product.save();
          summary.updated++;
          console.log(`調試: 為產品 "${product.name}" (${product.productCode}) 添加新庫存: ${qty}`);
        }
      }
    }
  }
}

// 使用 pdfjs-dist 提取 PDF 文本
async function extractByPdfjs(buffer: Buffer): Promise<string> {
  try {
    const doc = await getDocument({ data: buffer }).promise;
    console.log(`調試: PDF 頁數: ${doc.numPages}`);
    
    let fullText = '';
    for (let p = 1; p <= doc.numPages; p++) {
      console.log(`調試: 處理第 ${p} 頁`);
      const page = await doc.getPage(p);
      const textContent = await page.getTextContent();
      
      const lines: string[] = [];
      let currentLine = '';
      let lastY = 0;
      
      for (const item of textContent.items) {
        const textItem = item as any;
        if (Math.abs(textItem.transform[5] - lastY) > 5) {
          if (currentLine.trim()) {
            lines.push(currentLine.trim());
          }
          currentLine = textItem.str;
          lastY = textItem.transform[5];
        } else {
          currentLine += textItem.str;
        }
      }
      
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      
      fullText += lines.join('\n') + '\n';
    }
    
    return fullText;
  } catch (error) {
    console.log('調試: pdfjs-dist 提取失敗，使用 pdf-parse 備用方案:', error);
    throw error;
  }
}

// 出貨導入
router.post('/outgoing', upload.array('files'), async (req, res) => {
  try {
    const { locationId } = req.body;
    const files = req.files as Express.Multer.File[];
    
    if (!locationId || !files || files.length === 0) {
      return res.status(400).json({ message: 'Missing locationId or files' });
    }
    
    const summary = { files: files.length, matched: 0, updated: 0, notFound: [] as string[], parsed: [] as any[] };
    
    for (const file of files) {
      console.log(`調試: 處理出貨文件: ${file.originalname}`);
      
      let text = '';
      try {
        text = await extractByPdfjs(file.buffer);
        console.log(`調試: pdfjs-dist 提取成功，文本長度: ${text.length}`);
      } catch (error) {
        console.log('調試: 使用 pdf-parse 備用方案');
        const data = await pdf(file.buffer);
        text = data.text;
        console.log(`調試: pdf-parse 提取成功，文本長度: ${text.length}`);
      }
      
      if (text) {
        const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
        console.log(`調試: pdf-parse 解析結果，總行數: ${lines.length}`);
        console.log(`調試: 前10行內容:`, lines.slice(0, 10));
        
        const codePattern = /(?:[A-Z]{1,8}[\-]?\d{2,8}[A-Za-z\/]*)|(?:\b\d{8,14}\b)|(?:WS-\d+[A-Za-z\/]+)/;
        const rows: { name: string; code: string; qty: number }[] = [];
        
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(codePattern);
          if (m) {
            console.log(`調試: 找到產品代碼 "${m[0]}" 在第 ${i} 行: "${lines[i]}"`);
            
            let qty = 0;
            for (let j = i; j < Math.min(i + 6, lines.length); j++) {
              const qtyMatch = lines[j].match(/\b(\d{1,5})\b/);
              if (qtyMatch) {
                const num = parseInt(qtyMatch[1], 10);
                if (num > 0 && num <= 1000) {
                  qty = num;
                  console.log(`調試: 在第 ${j} 行找到數量: ${qty}`);
                  break;
                }
              }
            }
            
            if (qty > 0) {
              const productName = lines[i - 1] || '';
              rows.push({ name: productName, code: m[0], qty });
              console.log(`調試: 添加產品 "${m[0]}" 數量: ${qty}`);
            } else {
              console.log(`調試: 產品 "${m[0]}" 未找到有效數量`);
            }
          }
        }
        
        console.log(`調試: 從 PDF 提取到 ${rows.length} 行數據:`, rows);
        summary.parsed.push(rows.map(r => ({ name: r.name, code: normalizeCode(r.code), qty: r.qty })));
        
        for (const r of rows) {
          console.log(`調試: 處理行數據:`, r);
          await updateByCodeVariants(r.code, r.qty, locationId, summary, 'out');
        }
      }
    }
    
    res.json(summary);
  } catch (e) {
    res.status(500).json({ message: 'Failed to import outgoing', error: String(e) });
  }
});

// 進貨導入
router.post('/incoming', upload.array('files'), async (req, res) => {
  try {
    const { locationId } = req.body;
    const files = req.files as Express.Multer.File[];
    
    if (!locationId || !files || files.length === 0) {
      return res.status(400).json({ message: 'Missing locationId or files' });
    }
    
    const summary = { files: files.length, matched: 0, updated: 0, notFound: [] as string[], parsed: [] as any[] };
    
    for (const file of files) {
      console.log(`調試: 處理進貨文件: ${file.originalname}`);
      
      let text = '';
      try {
        text = await extractByPdfjs(file.buffer);
        console.log(`調試: pdfjs-dist 提取成功，文本長度: ${text.length}`);
      } catch (error) {
        console.log('調試: 使用 pdf-parse 備用方案');
        const data = await pdf(file.buffer);
        text = data.text;
        console.log(`調試: pdf-parse 提取成功，文本長度: ${text.length}`);
      }
      
      if (text) {
        const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
        console.log(`調試: pdf-parse 解析結果，總行數: ${lines.length}`);
        console.log(`調試: 前10行內容:`, lines.slice(0, 10));
        
        const codePattern = /(?:[A-Z]{1,8}[\-]?\d{2,8}[A-Za-z\/]*)|(?:\b\d{8,14}\b)|(?:WS-\d+[A-Za-z\/]+)/;
        const rows: { name: string; code: string; qty: number }[] = [];
        
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(codePattern);
          if (m) {
            console.log(`調試: 找到產品代碼 "${m[0]}" 在第 ${i} 行: "${lines[i]}"`);
            
            let qty = 0;
            for (let j = i; j < Math.min(i + 6, lines.length); j++) {
              const qtyMatch = lines[j].match(/\b(\d{1,5})\b/);
              if (qtyMatch) {
                const num = parseInt(qtyMatch[1], 10);
                if (num > 0 && num <= 1000) {
                  qty = num;
                  console.log(`調試: 在第 ${j} 行找到數量: ${qty}`);
                  break;
                }
              }
            }
            
            if (qty > 0) {
              const productName = lines[i - 1] || '';
              rows.push({ name: productName, code: m[0], qty });
              console.log(`調試: 添加產品 "${m[0]}" 數量: ${qty}`);
            } else {
              console.log(`調試: 產品 "${m[0]}" 未找到有效數量`);
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
    }
    
    res.json(summary);
  } catch (e) {
    res.status(500).json({ message: 'Failed to import incoming', error: String(e) });
  }
});

export default router;
