async function updateByCodeVariants(rawCode: string, qty: number, locationId: string, summary: any, direction: 'out' | 'in') {
  const variants = codeVariants(rawCode);
  console.log(`調試: 原始代碼 "${rawCode}" -> 變體:`, variants);
  if (variants.length === 0) return;
  const product = await Product.findOne({ productCode: { $in: variants } });
  console.log(`調試: 查詢條件:`, { productCode: { $in: variants } });
  console.log(`調試: 查詢結果:`, product ? `找到產品 ${product.productCode}` : '未找到產品');
  if (!product) {
    console.log(`調試: 嘗試直接查詢原始代碼: "${rawCode}"`);
    const directProduct = await Product.findOne({ productCode: rawCode });
    console.log(`調試: 直接查詢結果:`, directProduct ? `找到產品 ${directProduct.productCode}` : '未找到產品');
  }
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
