import express from 'express';
import multer from 'multer';
import pdf from 'pdf-parse';
import XLSX from 'xlsx';
import mongoose from 'mongoose';
import Product from '../models/Product';
import Location from '../models/Location';

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { getDocument } = pdfjsLib;

const router = express.Router();

// �t�mmulter�ϥΤ��s�s�x
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB����
});

// ���U����
function normalizeCode(s: string) {
  return (s || '').replace(/[�X�V?�V?]/g, '-').replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
}

function codeVariants(raw: string): string[] {
  const n = normalizeCode(raw);
  const variants = new Set<string>();
  if (n) variants.add(n);
  const m = n.match(/^([A-Z]+)_?(\d+)$/);
  if (m) variants.add(`${m[1]}-${m[2]}`);
  if (n) variants.add(n.replace(/-/g, ''));
  return Array.from(variants).filter(Boolean);
}

// Support alphanumeric model codes like AB-1234 and numeric-only barcodes (EAN-8/12/13/14)
const codePattern = /(?:[A-Z]{1,8}[\-�X�V?�V?]?\d{2,8})|(?:\b\d{8,14}\b)/;

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
          // If �����C�ʥ��AcodeX �i�� null�A�y���q name ������
          nameX = [nameHead.x - 2, (codeHead ? codeHead.x : qtyHead.x) - 2];
          codeX = codeHead ? [codeHead.x - 2, qtyHead.x - 2] : null as any;
          // ���e�ƶq���e�A�קK���Ʀr�Q�I�_
          qtyX = [qtyHead.x - 2, qtyHead.x + 260];
        }
        break;
      }
    }

    if (!nameX || !qtyX) continue;

    const headerIndex = lines.findIndex(L => {
      const t = L.map((t: any) => t.str).join('');
      return /(�ӫ~�Ա�|���~�y�z|�ӫ~�y�z|�ӫ~�W��|�~�W)/.test(t) && /(�ƶq|�ƥ�|�`�@�ƶq|�w�s�ƶq)/.test(t);
    });
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
      const codeMatch = codeSource.match(codePattern);
      // �ƶq���\���j���ơ]�̦h5���^�A�B�u�����ƶq���쪺�Ĥ@�Ӿ���
      const qtyMatch = qtyText.match(/\b(\d{1,5})\b/);
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 0;
      if (codeMatch && qty > 0) rows.push({ name, code: codeMatch[0], qty });
    }
  }

  try { await (doc as any).destroy(); } catch {}
  return rows;
}

async function updateByCodeVariants(rawCode: string, qty: number, locationId: string, summary: any, direction: 'out' | 'in') {
  const variants = codeVariants(rawCode);
  if (variants.length === 0) return;
  const product = await Product.findOne({ productCode: { $in: variants } });
  if (!product) { summary.notFound.push(normalizeCode(rawCode)); return; }
  summary.matched++;
  const inv = product.inventories.find(i => String(i.locationId) === String(locationId));
  if (inv) inv.quantity = direction === 'out' ? Math.max(0, inv.quantity - qty) : inv.quantity + qty;
  else product.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: direction === 'out' ? 0 : qty });
  await product.save();
  summary.updated++;
}

// �i�f�\��
router.post('/incoming', upload.array('files'), async (req, res) => {
  try {
    console.log('�ո�: �����i�f�ШD');
    const { locationId } = req.body;
    const files = req.files as Express.Multer.File[];
    console.log('�ո�: locationId =', locationId);
    console.log('�ո�: ���������ƶq =', files?.length || 0);
    
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
      notFound: [] as string[],
      parsed: [] as any[],
      errors: [] as string[]
    };
    
    for (const file of files) {
      try {
        let rows: { name: string; code: string; qty: number }[] = [];
        try { 
          rows = await extractByPdfjs(file.buffer); 
        } catch (pdfjsError) {
          console.log('PDF.js �ѪR���ѡA���ըϥ� pdf-parse:', pdfjsError);
        }
        
        if (rows.length === 0) {
          const data = await pdf(file.buffer);
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

        console.log(`�ո�: �q PDF ������ ${rows.length} ���ƾ�:`, rows);
        summary.parsed.push(rows.map(r => ({ name: r.name, code: normalizeCode(r.code), qty: r.qty })));
        for (const r of rows) {
          console.log(`�ո�: �B�z���ƾ�:`, r);
          await updateByCodeVariants(r.code, r.qty, locationId, summary, 'in');
        }
      } catch (fileError) {
        console.error('�ո�: �i�f�B�z���~:', fileError);
        summary.errors.push(`���� ${file.originalname} �B�z���~: ${fileError}`);
      }
    }
    
    res.json(summary);
  } catch (e) {
    console.error('�ո�: �i�f�B�z���~:', e);
    res.status(500).json({ message: 'Failed to process incoming', error: String(e) });
  }
});

// �X�f�\��
router.post('/outgoing', upload.array('files'), async (req, res) => {
  try {
    const { locationId } = req.body as any;
    if (!locationId) return res.status(400).json({ message: 'locationId required' });
    const files = (req.files as Express.Multer.File[]) || [];

    const summary = { files: files.length, matched: 0, updated: 0, notFound: [] as string[], parsed: [] as any[],
  errors: [] as string[] };

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

// �������ե\��
router.post('/transfer', upload.array('files'), async (req, res) => {
  try {
    console.log('�ո�: �����������սШD');
    const { fromLocationId, toLocationId } = req.body;
    const files = req.files as Express.Multer.File[];
    
    if (!fromLocationId || !toLocationId) {
      return res.status(400).json({ message: 'Missing location IDs' });
    }
    
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'Missing files' });
    }
    
    const summary = { 
      files: files.length, 
      processed: 0,
      matched: 0, 
      updated: 0, 
      notFound: [] as string[],
      parsed: [] as any[],
  errors: [] as string[]
    };
    
    for (const file of files) {
      try {
        let rows: { name: string; code: string; qty: number }[] = [];
        try { 
          rows = await extractByPdfjs(file.buffer); 
        } catch (pdfjsError) {
          console.log('PDF.js �ѪR���ѡA���ըϥ� pdf-parse:', pdfjsError);
        }
        
        if (rows.length === 0) {
          const data = await pdf(file.buffer);
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

        console.log(`�ո�: �q PDF ������ ${rows.length} ���ƾ�:`, rows);
        summary.parsed.push(rows.map(r => ({ name: r.name, code: normalizeCode(r.code), qty: r.qty })));
        
        for (const r of rows) {
          summary.processed++;
          
          // �d���{�����~
          const variants = codeVariants(r.code);
          if (variants.length === 0) continue;
          
          const product = await Product.findOne({ productCode: { $in: variants } });
          if (!product) { 
            summary.notFound.push(normalizeCode(r.code)); 
            continue; 
          }
          
          summary.matched++;
          
          // ���֨ӷ������w�s
          let fromInventory = product.inventories.find((inv: any) => 
            inv.locationId.toString() === fromLocationId
          );
          
          if (fromInventory && fromInventory.quantity >= r.qty) {
            fromInventory.quantity -= r.qty;
            
            // �W�[�ؼЪ����w�s
            let toInventory = product.inventories.find((inv: any) => 
              inv.locationId.toString() === toLocationId
            );
            
            if (toInventory) {
              toInventory.quantity += r.qty;
            } else {
              product.inventories.push({
                locationId: new mongoose.Types.ObjectId(toLocationId),
                quantity: r.qty
              });
            }
            
            await product.save();
            summary.updated++;
          } else {
            summary.notFound.push(`���~ ${r.code} �b�ӷ������w�s����`);
          }
        }
      } catch (fileError) {
        summary.notFound.push(`���� ${file.originalname} �B�z���~: ${fileError}`);
      }
    }
    
    res.json(summary);
  } catch (e) {
    console.error('�ո�: �������ճB�z���~:', e);
    res.status(500).json({ message: 'Failed to process transfer', error: String(e) });
  }
});

// Excel�ɤJ�\��
router.post('/excel', upload.array('files'), async (req, res) => {
  try {
    console.log('�ո�: ����Excel�ɤJ�ШD');
    const files = req.files as Express.Multer.File[];
    console.log('�ո�: ����Excel�����ƶq =', files?.length || 0);
    
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'Missing Excel files' });
    }
    
    const summary = { 
      files: files.length, 
      processed: 0,
      matched: 0, 
      created: 0,
      updated: 0, 
      errors: [] as string[]
    };
    
    for (const file of files) {
      try {
        // Ū��Excel����
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (data.length < 2) {
          summary.errors.push(`���� ${file.originalname}: �ƾڦ��Ƥ���`);
          continue;
        }
        
        // �������D���]�Ĥ@���^
        const headers = data[0] as string[];
        console.log('�ո�: Excel���D��:', headers);
        
        // �ھڲĤ@�椺�e�P�_�C����
        const columnIndexes: Record<string, number> = {};
        const columnMappings: Record<string, string[]> = {
          'productCode': ['�s��', '����', '���~�s��', '�f��', 'SKU', '���~�N�X', '�N�X', '�s�X'],
          'productName': ['���~', '�ӫ~�Ա�', '�ӫ~�W��', '���~�W��', '�W��', '�ӫ~', '�~�W'],
          'size': ['�ؤo', '�ӫ~�ﶵ', '�W��', '�ﶵ', '�ؽX', '�j�p'],
          '�[��': ['�[��', '�[����', '�[������', '�[����', '�[���w�s'],
          '�W�J': ['�W�J', '�W�J��', '�W�J����', '�W�J��', '�W�J�w�s'],
          '���K��': ['���K��', '���K����', '���K������', '���K����', '���K���w�s'],
          '����': ['����', '���ԩ�', '���Ԫ���', '���ԭ�', '���Ԯw�s'],
          '��?��': ['�ꤺ��', '��?��', '�ܮw', '�`��', '��?', '�ꤺ', '��?�ܮw', '�ꤺ�ܮw']
        };
        
        // �ѧO�C����
        for (const [columnType, variants] of Object.entries(columnMappings)) {
          let found = false;
          for (const variant of variants) {
            const index = headers.findIndex(h => h && h.toString().trim() === variant);
            if (index !== -1) {
              columnIndexes[columnType] = index;
              found = true;
              console.log(`�ո�: �����C "${columnType}" ���� "${variant}" �b���� ${index}`);
              break;
            }
          }
          if (!found && ['productCode', 'productName', 'size'].includes(columnType)) {
            summary.errors.push(`���� ${file.originalname}: �ʤ֥��ݦC "${columnType}" (����������: ${variants.join(', ')})`);
          }
        }
        
        // �ˬd���ݪ��C�O�_�s�b - �״_�o�̡I
        if (columnIndexes.productCode === undefined || columnIndexes.productName === undefined || columnIndexes.size === undefined) {
          console.log('�ո�: �ʤ֥��ݦC');
          continue;
        }
        
        // ��������ID�M�g
        const locations = await Location.find({});
        const locationMap: Record<string, string> = {};
        locations.forEach((loc: any) => {
          locationMap[loc.name] = loc._id.toString();
        });
        
        // �q�ĤG���}�l�B�z�ƾ�
        for (let i = 1; i < data.length; i++) {
          const row = data[i] as any[];
          if (!row || row.length === 0) continue;
          
          try {
            // �����򥻲��~�H��
            const productCode = row[columnIndexes.productCode]?.toString().trim();
            const productName = row[columnIndexes.productName]?.toString().trim();
            const size = row[columnIndexes.size]?.toString().trim();
            
            if (!productCode || !productName || !size) {
              summary.errors.push(`��${i+1}��: �s���B���~�W�٩Τؤo����`);
              continue;
            }
            
            summary.processed++;
            
            // �d���{�����~
            let product = await Product.findOne({
              name: productName,
              productCode: productCode,
              $or: [
                { size: size },
                { sizes: { $in: [size] } }
              ]
            });
            
            if (product) {
              // ���s�{�����~���w�s
              summary.matched++;
              for (const locationName of ['�[��', '�W�J', '���K��', '����', '��?��']) {
                if (columnIndexes[locationName] !== undefined) {
                  const quantity = parseInt(row[columnIndexes[locationName]]?.toString() || '0', 10);
                  if (quantity > 0) {
                    const locationId = locationMap[locationName];
                    if (locationId) {
                      let inventory = product.inventories.find((inv: any) => inv.locationId.toString() === locationId);
                      if (inventory) {
                        inventory.quantity += quantity;
                      } else {
                        product.inventories.push({
                          locationId: new mongoose.Types.ObjectId(locationId),
                          quantity: quantity
                        });
                      }
                    }
                  }
                }
              }
              await product.save();
              summary.updated++;
            } else {
              // �Ыطs���~
              summary.created++;
              
              // �T�w���~�����]�����W�ٱ����^
              let productType = '���L';
              if (productName.includes('�O�x') || productName.includes('���H')) {
                productType = '�O�x��';
              } else if (productName.includes('����')) {
                productType = '����';
              } else if (productName.includes('�W��')) {
                productType = '�W����';
              }
              
              // �����U�������w�s
              const inventories = [];
              for (const locationName of ['�[��', '�W�J', '���K��', '����', '��?��']) {
                if (columnIndexes[locationName] !== undefined) {
                  const quantity = parseInt(row[columnIndexes[locationName]]?.toString() || '0', 10);
                  if (quantity > 0) {
                    const locationId = locationMap[locationName];
                    if (locationId) {
                      inventories.push({
                        locationId: new mongoose.Types.ObjectId(locationId),
                        quantity: quantity
                      });
                    }
                  }
                }
              }
              
              // �Ыطs���~
              const newProduct = new Product({
                name: productName,
                productCode: productCode,
                productType: productType,
                size: size, // �ϥγ��@�ؤo�榡
                price: 0, // �q�{����
                inventories: inventories
              });
              
              await newProduct.save();
            }
          } catch (rowError) {
            summary.errors.push(`��${i+1}���B�z���~: ${rowError}`);
          }
        }
      } catch (fileError) {
        summary.errors.push(`���� ${file.originalname} �B�z���~: ${fileError}`);
      }
    }
    
    res.json(summary);
  } catch (e) {
    console.error('�ո�: Excel�ɤJ�B�z���~:', e);
    res.status(500).json({ message: 'Failed to import Excel', error: String(e) });
  }
});

export default router;
