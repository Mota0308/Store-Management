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
  return (s || '').replace(/[]/g, '-').replace(/[^A-Za-z0-9_\/-]/g, '').toUpperCase();
}

function codeVariants(raw: string): string[] {
  const n = normalizeCode(raw);
  const variants = new Set<string>();
  if (n) variants.add(n);
  
  // ������¦�����]�p WS-409PBK/LB  WS-409�^
  const baseMatch = n.match(/^([A-Z]+[\-]?\d+)/);
  if (baseMatch) {
    variants.add(baseMatch[1]);
  }
  
  // �s�W�G�B�z�h���̫�@�Ӧr�Ū����p�]WS-409PBK/LB  WS-409PBK/L�^
  if (n.length > 1) {
    variants.add(n.slice(0, -1));
  }
  
  // �s�W�G�B�z�h���̫��Ӧr�Ū����p�]WS-409PBK/LB  WS-409PBK/�^
  if (n.length > 2) {
    variants.add(n.slice(0, -2));
  }
  
  // �s�W�G�B�z�h���׽u�᭱�������]WS-409PBK/LB  WS-409PBK�^
  const slashIndex = n.lastIndexOf('/');
  if (slashIndex > 0) {
    variants.add(n.substring(0, slashIndex));
  }
  
  // �즳�޿�
  const m = n.match(/^([A-Z]+)_?(\d+)$/);
  if (m) variants.add(`${m[1]}-${m[2]}`);
  if (n) variants.add(n.replace(/-/g, ''));
  
  return Array.from(variants).filter(Boolean);
}

// �״_���ؤo�ǰt��� - �����h�榡
function extractSizeAndCode(text: string): { baseCode: string; size: string; quantity: number } | null {
  try {
    console.log(`�ո�: ���ոѪR�ؤo��: "${text}"`);
    
    // �ǰt�榡: WS-409PBK/LB3XL 3XL �� WS-409TBKLB3XL 3XL
    const sizeMatch = text.match(/^(WS-\d+[A-Za-z\/]+)(\d*)(XL|L|M|S|XS|XXS)\s+\d+/);
    if (sizeMatch) {
      const quantityMatch = text.match(/\d+$/);
      if (quantityMatch) {
        return {
          baseCode: sizeMatch[1],  // WS-409PBK/LB �� WS-409TBKLB
          size: (sizeMatch[2] || '1') + sizeMatch[3],  // 3XL �� 1XL
          quantity: parseInt(quantityMatch[0], 10)  // �̫᪺�Ʀr
        };
      }
    }
    
    // �s�W�G�ǰt�榡 WS-409TBKLB3XL 3XL�]�S���׽u�����p�^
    const sizeMatch2 = text.match(/^(WS-\d+[A-Za-z]+)(\d*)(XL|L|M|S|XS|XXS)\s+\d+/);
    if (sizeMatch2) {
      const quantityMatch = text.match(/\d+$/);
      if (quantityMatch) {
        return {
          baseCode: sizeMatch2[1],  // WS-409TBKLB
          size: (sizeMatch2[2] || '1') + sizeMatch2[3],  // 3XL �� 1XL
          quantity: parseInt(quantityMatch[0], 10)  // �̫᪺�Ʀr
        };
      }
    }
    
    return null;
  } catch (error) {
    console.log(`�ո�: extractSizeAndCode ���~:`, error);
    return null;
  }
}

// �s�W�G�ͦ��]�t�ؤo�����~�N�X����
function codeVariantsWithSize(baseCode: string, size: string): string[] {
  const variants = new Set<string>();
  
  // �K�[��l�N�X
  variants.add(baseCode);
  
  // �K�[�a�ؤo���N�X
  variants.add(`${baseCode}${size}`);
  
  // �K�[��¦��������
  const baseVariants = codeVariants(baseCode);
  baseVariants.forEach(variant => {
    variants.add(variant);
    variants.add(`${variant}${size}`);
  });
  
  return Array.from(variants).filter(Boolean);
}

// ��i�����h��F���A�����h�榡�����~�N�X
const codePattern = /(?:[A-Z]{1,8}[\-]?\d{2,8}[A-Za-z\/]*)|(?:\b\d{8,14}\b)|(?:WS-\d+[A-Za-z\/]+)/;

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

  console.log(`�ո�: PDF�`����: ${doc.numPages}`);

  for (let p = 1; p <= doc.numPages; p++) {
    console.log(`�ո�: �B�z�� ${p} ��`);
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

    console.log(`�ո�: �� ${p} ���`���: ${lines.length}`);

    let nameX: [number, number] | null = null;
    let codeX: [number, number] | null = null;
    let qtyX: [number, number] | null = null;

    for (const L of lines) {
      const text = L.map(t => t.str).join('');
      // Expanded header synonyms based on provided PDF formats
      const nameHeadRegex = /(�ӫ~�Ա�|���~�y�z|�ӫ~�y�z|�ӫ~�W��|�~�W)/;
      const codeHeadRegex = /(����|���X���X|���X|���νX|���X�s��|�����s��|�f��)/;
      const qtyHeadRegex = /(�ƶq|�ƥ�|�`�@�ƶq|�w�s�ƶq)/;
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
          // If �����C�ʥ��AcodeX �i�� null�A�y��q name ������
          nameX = [nameHead.x - 2, (codeHead ? codeHead.x : qtyHead.x) - 2];
          codeX = codeHead ? [codeHead.x - 2, qtyHead.x - 2] : null as any;
          // ��e�ƶq��e�A�קK���Ʀr�Q�I�_
          qtyX = [qtyHead.x - 2, qtyHead.x + 260];
        }
        console.log(`�ո�: �����Y�AnameX: ${nameX}, codeX: ${codeX}, qtyX: ${qtyX}`);
        break;
      }
    }

    if (!nameX || !qtyX) {
      console.log(`�ո�: �� ${p} ���������Y�A���L`);
      continue;
    }

    const headerIndex = lines.findIndex(L => {
      const t = L.map((t: any) => t.str).join('');
      return /(�ӫ~�Ա�|���~�y�z|�ӫ~�y�z|�ӫ~�W��|�~�W)/.test(t) && /(�ƶq|�ƥ�|�`�@�ƶq|�w�s�ƶq)/.test(t);
    });
    
    console.log(`�ո�: ���Y����: ${headerIndex}`);
    
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const L = lines[i].slice().sort(byX);
      const lineText = L.map((t: any) => t.str).join('').trim();
      if (!lineText || /�p�p|�X�p|���B|�Ƶ�|--END--/i.test(lineText)) break;

      const inRange = (x: number, R: [number, number]) => x >= R[0] && x < R[1];
      const pick = (R: [number, number]) => L.filter(t => inRange(t.transform[4], R)).map((t: any) => t.str).join('').trim();

      const name = pick(nameX);
      const codeText = codeX ? pick(codeX) : '';
      const qtyText = pick(qtyX);

      // �����i�X�{�b�����C�ΰӫ~�Ա��C���夤
      const codeSource = `${codeText} ${name}`.trim();
      
      // �K�[�ԲӪ��ոիH��
      if (codeSource.includes('WS-409') || codeSource.includes('409')) {
        console.log(`�ո�: ���]�t WS-409 ���� ${i}: "${lineText}"`);
        console.log(`�ո�: name: "${name}", codeText: "${codeText}", qtyText: "${qtyText}"`);
        console.log(`�ո�: codeSource: "${codeSource}"`);
      }
      
      const codeMatch = codeSource.match(codePattern);
      // �ƶq���\��j��ơ]�̦h5��^�A�B�u�����ƶq��쪺�Ĥ@�Ӿ��
      const qtyMatch = qtyText.match(/\b(\d{1,5})\b/);
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 0;
      
      if (codeMatch) {
        console.log(`�ո�: ��첣�~�N�X "${codeMatch[0]}" �b�� ${i} ��A�ƶq: ${qty}`);
        if (qty > 0) {
          rows.push({ name, code: codeMatch[0], qty });
        }
      }
    }
  }

  console.log(`�ո�: PDF�ѪR�����A�`�@������ ${rows.length} �Ӳ��~`);
  console.log(`�ո�: ���������~�N�X:`, rows.map(r => r.code));

  try { await (doc as any).destroy(); } catch {}
  return rows;
}

async function updateByCodeVariants(rawCode: string, qty: number, locationId: string, summary: any, direction: 'out' | 'in') {
  const variants = codeVariants(rawCode);
  console.log(`�ո�: ��l�N�X "${rawCode}" -> ����:`, variants);
  if (variants.length === 0) return;
  const product = await Product.findOne({ productCode: { $in: variants } });
  console.log(`�ո�: �d�ߵ��G:`, product ? `��첣�~ ${product.productCode}` : '����첣�~');
  if (!product) { 
    summary.notFound.push(normalizeCode(rawCode)); 
    return; 
  }
  summary.matched++;
  const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
  if (inv) inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
  else product.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: direction === 'out' ? 0 : qty });
  await product.save();
  summary.updated++;
}

// �s�W�G�a�ؤo�����~��s���
async function updateByCodeVariantsWithSize(baseCode: string, size: string, qty: number, locationId: string, summary: any, direction: 'out' | 'in') {
  const variants = codeVariantsWithSize(baseCode, size);
  console.log(`�ո�: ��¦�N�X "${baseCode}" �ؤo "${size}" -> ����:`, variants);
  if (variants.length === 0) return;
  const product = await Product.findOne({ productCode: { $in: variants } });
  console.log(`�ո�: �d�ߵ��G:`, product ? `��첣�~ ${product.productCode}` : '����첣�~');
  if (!product) { 
    summary.notFound.push(normalizeCode(`${baseCode}${size}`)); 
    return; 
  }
  summary.matched++;
  const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
  if (inv) inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
  else product.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: direction === 'out' ? 0 : qty });
  await product.save();
  summary.updated++;
}

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
          console.log(`�ո�: pdf-parse �ѪR���G�A�`���: ${lines.length}`);
          console.log(`�ո�: �e10�椺�e:`, lines.slice(0, 10));
          
          // �d��]�t WS-409 ����
          const ws409Lines = lines.filter((line: string) => line.includes('WS-409'));
          console.log(`�ո�: �]�t WS-409 ����:`, ws409Lines);
          
          // �״_���ƶq�ǰt�޿� - ���PDF��ڵ��c�A�]�t�ؤo�ǰt
          for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(codePattern);
            if (m) {
              console.log(`�ո�: ��첣�~�N�X "${m[0]}" �b�� ${i} ��: "${lines[i]}"`);
              
              // �ˬd�O�_���ؤo��]�p "WS-409PBK/LB3XL 3XL"�^
              const sizeInfo = extractSizeAndCode(lines[i]);
              if (sizeInfo) {
                console.log(`�ո�: ���ؤo�H�� - ��¦�N�X: ${sizeInfo.baseCode}, �ؤo: ${sizeInfo.size}, �ƶq: ${sizeInfo.quantity}`);
                rows.push({ 
                  name: lines[i - 1] || '', 
                  code: sizeInfo.baseCode, 
                  qty: sizeInfo.quantity 
                });
                console.log(`�ո�: �K�[�a�ؤo�����~ "${sizeInfo.baseCode}" �ؤo "${sizeInfo.size}" �ƶq: ${sizeInfo.quantity}`);
              } else {
                // �즳���ƶq�����޿�
                let qty = 0;
                let productName = '';
                
                // �ˬd��e��O�_�]�t�ؤo�M�ƶq�]�p "WS-409PBK/LB3XL 3XL"�^
                const sizeQtyMatch = lines[i].match(/(\d+)(XL|L|M|S|XS|XXS|2XL|3XL)\s+\d+/);
                if (sizeQtyMatch) {
                  qty = parseInt(sizeQtyMatch[1], 10);
                  productName = lines[i - 1] || '';
                  console.log(`�ո�: �q�ؤo����ƶq ${qty} (${sizeQtyMatch[0]})`);
                } else {
                  // �ˬd�U�@��O�_�]�t�ؤo�M�ƶq
                  for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
                    const nextLine = lines[j];
                    const nextSizeQtyMatch = nextLine.match(/(\d+)(XL|L|M|S|XS|XXS|2XL|3XL)\s+\d+/);
                    if (nextSizeQtyMatch) {
                      qty = parseInt(nextSizeQtyMatch[1], 10);
                      productName = lines[i - 1] || '';
                      console.log(`�ո�: �b�� ${j} ����ƶq ${qty} (${nextSizeQtyMatch[0]})`);
                      break;
                    }
                    
                    // �ˬd�O�_���¼Ʀr��]�i��O�ƶq�^
                    const pureNumberMatch = nextLine.match(/^\d{1,3}$/);
                    if (pureNumberMatch && parseInt(pureNumberMatch[0], 10) <= 100) {
                      qty = parseInt(pureNumberMatch[0], 10);
                      productName = lines[i - 1] || '';
                      console.log(`�ո�: �b�� ${j} ����¼Ʀr�ƶq ${qty}`);
                      break;
                    }
                  }
                }
                
                if (qty > 0) {
                  rows.push({ name: productName, code: m[0], qty });
                  console.log(`�ո�: �K�[���~ "${m[0]}" �ƶq: ${qty}`);
                } else {
                  console.log(`�ո�: ���~ "${m[0]}" ����즳�ļƶq`);
                }
              }
            }
          }
        }
      }

      summary.parsed.push(rows.map(r => ({ name: r.name, code: normalizeCode(r.code), qty: r.qty })));
      for (const r of rows) await updateByCodeVariants(r.code, r.qty, locationId, summary, 'out');
    }

    res.json(summary);
  } catch (e) {
    console.error('�ո�: outgoing ���~:', e);
    res.status(500).json({ message: 'Failed to import outgoing', error: String(e) });
  }
});

router.post('/incoming', upload.array('files'), async (req, res) => {
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
          console.log(`�ո�: pdf-parse �ѪR���G�A�`���: ${lines.length}`);
          console.log(`�ո�: �e10�椺�e:`, lines.slice(0, 10));
          
          // �d��]�t WS-409 ����
          const ws409Lines = lines.filter((line: string) => line.includes('WS-409'));
          console.log(`�ո�: �]�t WS-409 ����:`, ws409Lines);
          
          // �s�W�G�h���޿� - �ϥ� Map �Ӱl�ܤw�B�z�����~�]��¦�N�X + �ؤo�^
          const processedProducts = new Map<string, { baseCode: string; size: string; quantity: number }>();
          
          // �״_���ƶq�ǰt�޿� - ���PDF��ڵ��c�A�]�t�ؤo�ǰt
          for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(codePattern);
            if (m) {
              console.log(`�ո�: ��첣�~�N�X "${m[0]}" �b�� ${i} ��: "${lines[i]}"`);
              
              // �ˬd�O�_���ؤo��]�p "WS-409PBK/LB3XL 3XL"�^
              const sizeInfo = extractSizeAndCode(lines[i]);
              if (sizeInfo) {
                console.log(`�ո�: ���ؤo�H�� - ��¦�N�X: ${sizeInfo.baseCode}, �ؤo: ${sizeInfo.size}, �ƶq: ${sizeInfo.quantity}`);
                
                // �Ыذߤ@�����~���Ѳš]��¦�N�X + �ؤo�^
                const productKey = `${sizeInfo.baseCode}_${sizeInfo.size}`;
                
                // �ˬd�O�_�w�g�B�z�L�o�Ӳ��~
                if (processedProducts.has(productKey)) {
                  console.log(`�ո�: ���L���ƪ����~ "${productKey}"`);
                  continue;
                }
                
                // �O���w�B�z�����~
                processedProducts.set(productKey, {
                  baseCode: sizeInfo.baseCode,
                  size: sizeInfo.size,
                  quantity: sizeInfo.quantity
                });
                
                rows.push({ 
                  name: lines[i - 1] || '', 
                  code: sizeInfo.baseCode, 
                  qty: sizeInfo.quantity 
                });
                console.log(`�ո�: �K�[�a�ؤo�����~ "${sizeInfo.baseCode}" �ؤo "${sizeInfo.size}" �ƶq: ${sizeInfo.quantity}`);
              } else {
                // �즳���ƶq�����޿�
                let qty = 0;
                let productName = '';
                
                // �ˬd��e��O�_�]�t�ؤo�M�ƶq�]�p "WS-409PBK/LB3XL 3XL"�^
                const sizeQtyMatch = lines[i].match(/(\d+)(XL|L|M|S|XS|XXS|2XL|3XL)\s+\d+/);
                if (sizeQtyMatch) {
                  qty = parseInt(sizeQtyMatch[1], 10);
                  productName = lines[i - 1] || '';
                  console.log(`�ո�: �q�ؤo����ƶq ${qty} (${sizeQtyMatch[0]})`);
                } else {
                  // �ˬd�U�@��O�_�]�t�ؤo�M�ƶq
                  for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
                    const nextLine = lines[j];
                    const nextSizeQtyMatch = nextLine.match(/(\d+)(XL|L|M|S|XS|XXS|2XL|3XL)\s+\d+/);
                    if (nextSizeQtyMatch) {
                      qty = parseInt(nextSizeQtyMatch[1], 10);
                      productName = lines[i - 1] || '';
                      console.log(`�ո�: �b�� ${j} ����ƶq ${qty} (${nextSizeQtyMatch[0]})`);
                      break;
                    }
                    
                    // �ˬd�O�_���¼Ʀr��]�i��O�ƶq�^
                    const pureNumberMatch = nextLine.match(/^\d{1,3}$/);
                    if (pureNumberMatch && parseInt(pureNumberMatch[0], 10) <= 100) {
                      qty = parseInt(pureNumberMatch[0], 10);
                      productName = lines[i - 1] || '';
                      console.log(`�ո�: �b�� ${j} ����¼Ʀr�ƶq ${qty}`);
                      break;
                    }
                  }
                }
                
                if (qty > 0) {
                  // �Ыذߤ@�����~���Ѳš]���~�N�X�^
                  const productKey = m[0];
                  
                  // �ˬd�O�_�w�g�B�z�L�o�Ӳ��~
                  if (processedProducts.has(productKey)) {
                    console.log(`�ո�: ���L���ƪ����~ "${productKey}"`);
                    continue;
                  }
                  
                  // �O���w�B�z�����~
                  processedProducts.set(productKey, {
                    baseCode: m[0],
                    size: '',
                    quantity: qty
                  });
                  
                  rows.push({ name: productName, code: m[0], qty });
                  console.log(`�ո�: �K�[���~ "${m[0]}" �ƶq: ${qty}`);
                } else {
                  console.log(`�ո�: ���~ "${m[0]}" ����즳�ļƶq`);
                }
              }
            }
          }
          
          console.log(`�ո�: �h�����`�@�B�z�F ${processedProducts.size} �Ӱߤ@���~`);
          console.log(`�ո�: �B�z�����~�C��:`, Array.from(processedProducts.entries()));
        }
      }

      summary.parsed.push(rows.map(r => ({ name: r.name, code: normalizeCode(r.code), qty: r.qty })));
      for (const r of rows) await updateByCodeVariants(r.code, r.qty, locationId, summary, 'in');
    }

    res.json(summary);
  } catch (e) {
    console.error('�ո�: incoming ���~:', e);
    res.status(500).json({ message: 'Failed to import incoming', error: String(e) });
  }
});

export default router;
