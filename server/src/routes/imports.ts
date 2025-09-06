import { Router } from 'express';
import multer from 'multer';
import pdf from 'pdf-parse';
import Product from '../models/Product';
import mongoose from 'mongoose';

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { getDocument } = pdfjsLib;

const router = Router();

const upload = multer({ dest: 'uploads/' });

// �ͦ����~�N�X���U������
function codeVariants(code: string): string[] {
  const variants = new Set<string>();
  variants.add(code);
  
  // �����ק��᪺����
  if (code.includes('/')) {
    variants.add(code.replace('/', ''));
  }
  
  // �����s�r�Ū�����
  if (code.includes('-')) {
    variants.add(code.replace(/-/g, ''));
  }
  
  // �����ǰt����
  const parts = code.split(/[-/]/);
  if (parts.length > 1) {
    variants.add(parts[0]);
    variants.add(parts.slice(0, 2).join(''));
  }
  
  return Array.from(variants).filter(Boolean);
}

// �зǤƲ��~�N�X
function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ��s�w�s
async function updateByCodeVariants(code: string, qty: number, locationId: string, summary: any, mode: 'in' | 'out') {
  const variants = codeVariants(code);
  console.log(`�ո�: �d�䲣�~�N�X "${code}" ������:`, variants);
  
  for (const variant of variants) {
    const products = await Product.find({ productCode: variant });
    console.log(`�ո�: ��� ${products.length} �Ӥǰt���~ (����: ${variant})`);
    
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
        console.log(`�ո�: ��s���~ "${product.name}" (${product.productCode}) �w�s: ${oldQty} -> ${inv.quantity}`);
      } else {
        if (mode === 'in') {
          product.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: qty });
          await product.save();
          summary.updated++;
          console.log(`�ո�: �����~ "${product.name}" (${product.productCode}) �K�[�s�w�s: ${qty}`);
        }
      }
    }
  }
}

// �ϥ� pdfjs-dist ���� PDF �奻
async function extractByPdfjs(buffer: Buffer): Promise<string> {
  try {
    const doc = await getDocument({ data: buffer }).promise;
    console.log(`�ո�: PDF ����: ${doc.numPages}`);
    
    let fullText = '';
    for (let p = 1; p <= doc.numPages; p++) {
      console.log(`�ո�: �B�z�� ${p} ��`);
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
    console.log('�ո�: pdfjs-dist �������ѡA�ϥ� pdf-parse �ƥΤ��:', error);
    throw error;
  }
}

// �X�f�ɤJ
router.post('/outgoing', upload.array('files'), async (req, res) => {
  try {
    const { locationId } = req.body;
    const files = req.files as Express.Multer.File[];
    
    if (!locationId || !files || files.length === 0) {
      return res.status(400).json({ message: 'Missing locationId or files' });
    }
    
    const summary = { files: files.length, matched: 0, updated: 0, notFound: [] as string[], parsed: [] as any[] };
    
    for (const file of files) {
      console.log(`�ո�: �B�z�X�f���: ${file.originalname}`);
      
      let text = '';
      try {
        text = await extractByPdfjs(file.buffer);
        console.log(`�ո�: pdfjs-dist �������\�A�奻����: ${text.length}`);
      } catch (error) {
        console.log('�ո�: �ϥ� pdf-parse �ƥΤ��');
        const data = await pdf(file.buffer);
        text = data.text;
        console.log(`�ո�: pdf-parse �������\�A�奻����: ${text.length}`);
      }
      
      if (text) {
        const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
        console.log(`�ո�: pdf-parse �ѪR���G�A�`���: ${lines.length}`);
        console.log(`�ո�: �e10�椺�e:`, lines.slice(0, 10));
        
        const codePattern = /(?:[A-Z]{1,8}[\-]?\d{2,8}[A-Za-z\/]*)|(?:\b\d{8,14}\b)|(?:WS-\d+[A-Za-z\/]+)/;
        const rows: { name: string; code: string; qty: number }[] = [];
        
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(codePattern);
          if (m) {
            console.log(`�ո�: ��첣�~�N�X "${m[0]}" �b�� ${i} ��: "${lines[i]}"`);
            
            let qty = 0;
            for (let j = i; j < Math.min(i + 6, lines.length); j++) {
              const qtyMatch = lines[j].match(/\b(\d{1,5})\b/);
              if (qtyMatch) {
                const num = parseInt(qtyMatch[1], 10);
                if (num > 0 && num <= 1000) {
                  qty = num;
                  console.log(`�ո�: �b�� ${j} ����ƶq: ${qty}`);
                  break;
                }
              }
            }
            
            if (qty > 0) {
              const productName = lines[i - 1] || '';
              rows.push({ name: productName, code: m[0], qty });
              console.log(`�ո�: �K�[���~ "${m[0]}" �ƶq: ${qty}`);
            } else {
              console.log(`�ո�: ���~ "${m[0]}" ����즳�ļƶq`);
            }
          }
        }
        
        console.log(`�ո�: �q PDF ������ ${rows.length} ��ƾ�:`, rows);
        summary.parsed.push(rows.map(r => ({ name: r.name, code: normalizeCode(r.code), qty: r.qty })));
        
        for (const r of rows) {
          console.log(`�ո�: �B�z��ƾ�:`, r);
          await updateByCodeVariants(r.code, r.qty, locationId, summary, 'out');
        }
      }
    }
    
    res.json(summary);
  } catch (e) {
    res.status(500).json({ message: 'Failed to import outgoing', error: String(e) });
  }
});

// �i�f�ɤJ
router.post('/incoming', upload.array('files'), async (req, res) => {
  try {
    const { locationId } = req.body;
    const files = req.files as Express.Multer.File[];
    
    if (!locationId || !files || files.length === 0) {
      return res.status(400).json({ message: 'Missing locationId or files' });
    }
    
    const summary = { files: files.length, matched: 0, updated: 0, notFound: [] as string[], parsed: [] as any[] };
    
    for (const file of files) {
      console.log(`�ո�: �B�z�i�f���: ${file.originalname}`);
      
      let text = '';
      try {
        text = await extractByPdfjs(file.buffer);
        console.log(`�ո�: pdfjs-dist �������\�A�奻����: ${text.length}`);
      } catch (error) {
        console.log('�ո�: �ϥ� pdf-parse �ƥΤ��');
        const data = await pdf(file.buffer);
        text = data.text;
        console.log(`�ո�: pdf-parse �������\�A�奻����: ${text.length}`);
      }
      
      if (text) {
        const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
        console.log(`�ո�: pdf-parse �ѪR���G�A�`���: ${lines.length}`);
        console.log(`�ո�: �e10�椺�e:`, lines.slice(0, 10));
        
        const codePattern = /(?:[A-Z]{1,8}[\-]?\d{2,8}[A-Za-z\/]*)|(?:\b\d{8,14}\b)|(?:WS-\d+[A-Za-z\/]+)/;
        const rows: { name: string; code: string; qty: number }[] = [];
        
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(codePattern);
          if (m) {
            console.log(`�ո�: ��첣�~�N�X "${m[0]}" �b�� ${i} ��: "${lines[i]}"`);
            
            let qty = 0;
            for (let j = i; j < Math.min(i + 6, lines.length); j++) {
              const qtyMatch = lines[j].match(/\b(\d{1,5})\b/);
              if (qtyMatch) {
                const num = parseInt(qtyMatch[1], 10);
                if (num > 0 && num <= 1000) {
                  qty = num;
                  console.log(`�ո�: �b�� ${j} ����ƶq: ${qty}`);
                  break;
                }
              }
            }
            
            if (qty > 0) {
              const productName = lines[i - 1] || '';
              rows.push({ name: productName, code: m[0], qty });
              console.log(`�ո�: �K�[���~ "${m[0]}" �ƶq: ${qty}`);
            } else {
              console.log(`�ո�: ���~ "${m[0]}" ����즳�ļƶq`);
            }
          }
        }
        
        console.log(`�ո�: �q PDF ������ ${rows.length} ��ƾ�:`, rows);
        summary.parsed.push(rows.map(r => ({ name: r.name, code: normalizeCode(r.code), qty: r.qty })));
        
        for (const r of rows) {
          console.log(`�ո�: �B�z��ƾ�:`, r);
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
