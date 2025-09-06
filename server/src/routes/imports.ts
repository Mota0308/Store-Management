import { Router } from 'express';
import multer from 'multer';
import pdf from 'pdf-parse';
import Product from '../models/Product';
import mongoose from 'mongoose';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// Generate product code variants
function codeVariants(code: string): string[] {
  const variants = new Set<string>();
  variants.add(code);
  
  if (code.includes('/')) {
    variants.add(code.replace('/', ''));
  }
  
  if (code.includes('-')) {
    variants.add(code.replace(/-/g, ''));
  }
  
  const parts = code.split(/[-/]/);
  if (parts.length > 1) {
    variants.add(parts[0]);
    variants.add(parts.slice(0, 2).join(''));
  }
  
  return Array.from(variants).filter(Boolean);
}

// Normalize product code
function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Update inventory by code variants
async function updateByCodeVariants(code: string, qty: number, locationId: string, summary: any, mode: 'in' | 'out') {
  const variants = codeVariants(code);
  
  for (const variant of variants) {
    const products = await Product.find({ productCode: variant });
    
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
      } else {
        if (mode === 'in') {
          product.inventories.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: qty });
          await product.save();
          summary.updated++;
        }
      }
    }
  }
}

// Outgoing import
router.post('/outgoing', upload.array('files'), async (req, res) => {
  try {
    const { locationId } = req.body;
    const files = req.files as Express.Multer.File[];
    
    if (!locationId || !files || files.length === 0) {
      return res.status(400).json({ message: 'Missing locationId or files' });
    }
    
    const summary = { 
      files: files.length, 
      matched: 0, 
      updated: 0, 
      notFound: [] as string[], 
      parsed: [] as any[] 
    };
    
    for (const file of files) {
      const data = await pdf(file.buffer);
      const text = data.text;
      
      if (text) {
        const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
        const codePattern = /(?:[A-Z]{1,8}[\-]?\d{2,8}[A-Za-z\/]*)|(?:\b\d{8,14}\b)|(?:WS-\d+[A-Za-z\/]+)/;
        const rows: { name: string; code: string; qty: number }[] = [];
        
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(codePattern);
          if (m) {
            let qty = 0;
            for (let j = i; j < Math.min(i + 6, lines.length); j++) {
              const qtyMatch = lines[j].match(/\b(\d{1,5})\b/);
              if (qtyMatch) {
                const num = parseInt(qtyMatch[1], 10);
                if (num > 0 && num <= 1000) {
                  qty = num;
                  break;
                }
              }
            }
            
            if (qty > 0) {
              const productName = lines[i - 1] || '';
              rows.push({ name: productName, code: m[0], qty });
            }
          }
        }
        
        summary.parsed.push(rows.map(r => ({ name: r.name, code: normalizeCode(r.code), qty: r.qty })));
        
        for (const r of rows) {
          await updateByCodeVariants(r.code, r.qty, locationId, summary, 'out');
        }
      }
    }
    
    res.json(summary);
  } catch (e) {
    res.status(500).json({ message: 'Failed to import outgoing', error: String(e) });
  }
});

// Incoming import
router.post('/incoming', upload.array('files'), async (req, res) => {
  try {
    const { locationId } = req.body;
    const files = req.files as Express.Multer.File[];
    
    if (!locationId || !files || files.length === 0) {
      return res.status(400).json({ message: 'Missing locationId or files' });
    }
    
    const summary = { 
      files: files.length, 
      matched: 0, 
      updated: 0, 
      notFound: [] as string[], 
      parsed: [] as any[] 
    };
    
    for (const file of files) {
      const data = await pdf(file.buffer);
      const text = data.text;
      
      if (text) {
        const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
        const codePattern = /(?:[A-Z]{1,8}[\-]?\d{2,8}[A-Za-z\/]*)|(?:\b\d{8,14}\b)|(?:WS-\d+[A-Za-z\/]+)/;
        const rows: { name: string; code: string; qty: number }[] = [];
        
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(codePattern);
          if (m) {
            let qty = 0;
            for (let j = i; j < Math.min(i + 6, lines.length); j++) {
              const qtyMatch = lines[j].match(/\b(\d{1,5})\b/);
              if (qtyMatch) {
                const num = parseInt(qtyMatch[1], 10);
                if (num > 0 && num <= 1000) {
                  qty = num;
                  break;
                }
              }
            }
            
            if (qty > 0) {
              const productName = lines[i - 1] || '';
              rows.push({ name: productName, code: m[0], qty });
            }
          }
        }
        
        summary.parsed.push(rows.map(r => ({ name: r.name, code: normalizeCode(r.code), qty: r.qty })));
        
        for (const r of rows) {
          await updateByCodeVariants(r.code, r.qty, locationId, summary, 'in');
        }
      }
    }
    
    res.json(summary);
  } catch (e) {
    res.status(500).json({ message: 'Failed to import incoming', error: String(e) });
  }
});

// Transfer between locations
router.post('/transfer', upload.array('files'), async (req, res) => {
  try {
    const { fromLocationId, toLocationId } = req.body;
    const files = req.files as Express.Multer.File[];
    
    if (!fromLocationId || !toLocationId || !files || files.length === 0) {
      return res.status(400).json({ message: 'Missing fromLocationId, toLocationId or files' });
    }
    
    if (fromLocationId === toLocationId) {
      return res.status(400).json({ message: 'From and to locations cannot be the same' });
    }
    
    const summary = { 
      files: files.length, 
      matched: 0, 
      updated: 0, 
      notFound: [] as string[], 
      parsed: [] as any[] 
    };
    
    for (const file of files) {
      const data = await pdf(file.buffer);
      const text = data.text;
      
      if (text) {
        const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
        const codePattern = /(?:[A-Z]{1,8}[\-]?\d{2,8}[A-Za-z\/]*)|(?:\b\d{8,14}\b)|(?:WS-\d+[A-Za-z\/]+)/;
        const rows: { name: string; code: string; qty: number }[] = [];
        
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(codePattern);
          if (m) {
            let qty = 0;
            for (let j = i; j < Math.min(i + 6, lines.length); j++) {
              const qtyMatch = lines[j].match(/\b(\d{1,5})\b/);
              if (qtyMatch) {
                const num = parseInt(qtyMatch[1], 10);
                if (num > 0 && num <= 1000) {
                  qty = num;
                  break;
                }
              }
            }
            
            if (qty > 0) {
              const productName = lines[i - 1] || '';
              rows.push({ name: productName, code: m[0], qty });
            }
          }
        }
        
        summary.parsed.push(rows.map(r => ({ name: r.name, code: normalizeCode(r.code), qty: r.qty })));
        
        // Process transfers: reduce from source, increase at destination
        for (const r of rows) {
          const variants = codeVariants(r.code);
          
          for (const variant of variants) {
            const products = await Product.find({ productCode: variant });
            
            for (const product of products) {
              const fromInv = product.inventories.find(i => String(i.locationId) === String(fromLocationId));
              const toInv = product.inventories.find(i => String(i.locationId) === String(toLocationId));
              
              // Reduce quantity from source location
              if (fromInv) {
                fromInv.quantity = Math.max(0, fromInv.quantity - r.qty);
              }
              
              // Increase quantity at destination location
              if (toInv) {
                toInv.quantity += r.qty;
              } else {
                // Create new inventory entry if destination doesn't exist
                product.inventories.push({ locationId: new mongoose.Types.ObjectId(toLocationId), quantity: r.qty });
              }
              
              await product.save();
              summary.updated++;
            }
          }
        }
      }
    }
    
    res.json(summary);
  } catch (e) {
    res.status(500).json({ message: 'Failed to process transfer', error: String(e) });
  }
});


export default router;
