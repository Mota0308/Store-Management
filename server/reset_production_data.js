const mongoose = require('mongoose');
require('dotenv').config({ path: './local.env' });

const MONGODB_URI =
  process.env.RAILWAY_MONGODB_URI ||
  'mongodb+srv://chenyaolin0308:9GUhZvnuEpAA1r6c@cluster0.0dhi0qc.mongodb.net/Storage?retryWrites=true&w=majority&appName=Cluster0';

// 1) 重置帳號（無 email，含 type）
const USERS_TO_CREATE = [
  { username: 'manager', password: '123456', type: 'manager' },
  { username: 'store1', password: '123456', type: 'store1' },
  { username: 'store2', password: '123456', type: 'store2' },
  { username: 'store3', password: '123456', type: 'store3' },
  { username: 'store4', password: '123456', type: 'store4' },
  { username: 'store5', password: '123456', type: 'store5' }
];

// 2) 刪除的地點
const LOCATIONS_TO_DELETE = ['元朗', '元朗觀塘倉', '元朗灣仔倉', '元朗荔枝角倉'];

async function main() {
  await mongoose.connect(MONGODB_URI, { dbName: 'Storage' });
  console.log('✅ Connected to production MongoDB (Storage)');

  const db = mongoose.connection.db;
  const users = db.collection('users');
  const locations = db.collection('locations');
  const products = db.collection('products');
  const restockSettings = db.collection('restockSettings'); // 若不存在也沒關係

  // A) 重置 users
  console.log('\n🔄 Resetting users...');
  
  // 先删除 email 索引（如果存在）
  try {
    await users.dropIndex('email_1');
    console.log('✅ Dropped email_1 index');
  } catch (e) {
    console.log('ℹ️ email_1 index not found or already dropped');
  }
  
  // 删除所有现有用户
  await users.deleteMany({});
  console.log('✅ Deleted all existing users');
  
  // 创建新用户
  await users.insertMany(USERS_TO_CREATE.map(u => ({ ...u, createdAt: new Date(), updatedAt: new Date() })));
  console.log(`✅ Created ${USERS_TO_CREATE.length} users (password=123456)`);

  // B) 刪除指定 locations
  console.log('\n🔄 Deleting specified locations...');
  const locDocs = await locations.find({ name: { $in: LOCATIONS_TO_DELETE } }).toArray();
  const locIds = locDocs.map(l => l._id);
  if (locIds.length > 0) {
    await locations.deleteMany({ _id: { $in: locIds } });
    console.log(`✅ Deleted locations: ${LOCATIONS_TO_DELETE.join(', ')}`);

    // 同步清理 products.inventories 中引用
    await products.updateMany(
      {},
      { $pull: { inventories: { locationId: { $in: locIds } } } }
    );
    console.log('✅ Cleaned product inventories referencing deleted locations');
  } else {
    console.log('ℹ️ No matching locations found to delete');
  }

  // C) 刪除所有 products
  console.log('\n🔄 Deleting all products...');
  const prodRes = await products.deleteMany({});
  console.log(`✅ Deleted products: ${prodRes.deletedCount || 0}`);

  // D) 清空補貨設定（若已建立）
  console.log('\n🔄 Clearing restock settings (if any)...');
  try {
    const rs = await restockSettings.deleteMany({});
    console.log(`✅ Deleted restock settings: ${rs.deletedCount || 0}`);
  } catch (e) {
    console.log('ℹ️ restockSettings collection not found / skipped');
  }

  console.log('\n✅ Reset completed.');
  console.log('Accounts: manager/store1/store2/store3/store4/store5  (password: 123456)');
}

main()
  .catch(err => {
    console.error('❌ Reset failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
    console.log('✅ Connection closed');
  });


