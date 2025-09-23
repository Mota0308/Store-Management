// 测试增加分组功能
const axios = require('axios');

async function testAddGroup() {
  try {
    console.log('🧪 测试增加分组功能...\n');
    
    const LOCAL_URL = 'http://localhost:4001/api';
    
    // 1. 获取门市列表
    console.log('📍 获取门市列表...');
    const locationsResponse = await axios.get(`${LOCAL_URL}/locations`);
    const locations = locationsResponse.data;
    console.log(`✅ 找到 ${locations.length} 个门市: ${locations.map(l => l.name).join(', ')}`);
    
    const locationIds = locations.map(l => l._id);
    
    // 2. 获取产品类型
    console.log('\n📋 获取产品类型...');
    const typesResponse = await axios.get(`${LOCAL_URL}/product-types`);
    const productTypes = typesResponse.data;
    console.log(`✅ 找到 ${productTypes.length} 个产品类型: ${productTypes.map(t => t.name).join(', ')}`);
    
    // 3. 创建测试产品
    console.log('\n🆕 创建测试产品...');
    const testProduct = {
      name: '测试增加分组产品',
      productCode: `TEST-${Date.now()}`,
      productType: productTypes.length > 0 ? productTypes[0].name : '默认类型',
      sizes: ['M'], // 新产品只有一个尺寸
      price: 99.99,
      locationIds: locationIds
    };
    
    console.log('📦 产品数据:', testProduct);
    
    const createResponse = await axios.post(`${LOCAL_URL}/products`, testProduct);
    const createdProduct = createResponse.data;
    
    console.log(`✅ 产品创建成功!`);
    console.log(`   ID: ${createdProduct._id}`);
    console.log(`   名称: ${createdProduct.name}`);
    console.log(`   编号: ${createdProduct.productCode}`);
    console.log(`   尺寸: [${createdProduct.sizes.join(', ')}]`);
    console.log(`   库存记录数: ${createdProduct.inventories.length}`);
    
    // 4. 验证库存记录
    console.log('\n📊 验证库存记录...');
    createdProduct.inventories.forEach((inv, index) => {
      const locationName = typeof inv.locationId === 'object' && inv.locationId 
        ? inv.locationId.name 
        : locations[index]?.name || '未知';
      console.log(`   ${locationName}: ${inv.quantity}`);
    });
    
    // 5. 获取产品列表确认
    console.log('\n🔍 确认产品已在列表中...');
    const productsResponse = await axios.get(`${LOCAL_URL}/products?search=${testProduct.productCode}`);
    const foundProducts = productsResponse.data;
    
    if (foundProducts.length > 0) {
      console.log(`✅ 在产品列表中找到 ${foundProducts.length} 个匹配产品`);
      const foundProduct = foundProducts[0];
      console.log(`   名称: ${foundProduct.name}`);
      console.log(`   编号: ${foundProduct.productCode}`);
    } else {
      console.log(`❌ 在产品列表中未找到产品`);
    }
    
    console.log('\n🎉 增加分组功能测试完成！');
    console.log('💡 现在可以在前端界面点击"增加分组"按钮测试UI功能');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('   响应状态:', error.response.status);
      console.error('   响应数据:', error.response.data);
    }
  }
}

// 运行测试
testAddGroup(); 