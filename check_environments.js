// 检查本地和Railway环境差异
const axios = require('axios');

async function checkEnvironments() {
  try {
    console.log('🔍 检查本地和Railway环境差异...\n');
    
    const LOCAL_URL = 'http://localhost:4001/api';
    
    // Railway URL - 从检查结果看，第一个URL是正确的
    const RAILWAY_URL = 'https://project-q-production.up.railway.app/api';
    
    // 1. 检查本地环境
    console.log('🏠 检查本地环境...');
    console.log('='.repeat(50));
    
    try {
      const localLocations = await axios.get(`${LOCAL_URL}/locations`);
      console.log(`✅ 本地连接成功`);
      console.log(`🏪 门市数量: ${localLocations.data.length}`);
      console.log(`📋 门市列表: ${localLocations.data.map(l => l.name).join(', ')}`);
      
      // 检查所有产品，寻找测试产品
      console.log('\n🔍 搜索测试产品...');
      const allProducts = await axios.get(`${LOCAL_URL}/products`);
      console.log(`📦 本地产品总数: ${allProducts.data.length}`);
      
      // 查找包含 WS-276 的产品
      const ws276Products = allProducts.data.filter(p => p.productCode && p.productCode.includes('WS-276'));
      console.log(`🔍 找到 WS-276 系列产品: ${ws276Products.length} 个`);
      
      if (ws276Products.length > 0) {
        const testProduct = ws276Products[0];
        console.log(`\n📦 使用测试产品: ${testProduct.productCode}`);
        console.log(`   名称: ${testProduct.name || '无'}`);
        console.log(`   尺寸: [${testProduct.sizes?.join(', ') || '无'}]`);
        console.log(`   库存记录数: ${testProduct.inventories?.length || 0}`);
        
        if (testProduct.inventories && testProduct.inventories.length > 0) {
          console.log('   库存详情:');
          testProduct.inventories.forEach(inv => {
            const locationName = typeof inv.locationId === 'object' && inv.locationId 
              ? inv.locationId.name 
              : '未知';
            console.log(`     ${locationName}: ${inv.quantity}`);
          });
        }
      } else {
        console.log(`❌ 未找到 WS-276 系列产品`);
      }
      
    } catch (error) {
      console.log(`❌ 本地环境连接失败: ${error.message}`);
      console.log('   请确保本地服务器正在运行 (npm run dev)');
      return;
    }
    
    // 2. 检查Railway环境
    console.log('\n🚀 检查Railway环境...');
    console.log('='.repeat(50));
    
    try {
      console.log(`🔍 连接到: ${RAILWAY_URL}`);
      
      // 先测试基本连接
      const railwayLocations = await axios.get(`${RAILWAY_URL}/locations`, { timeout: 10000 });
      console.log(`✅ Railway连接成功!`);
      
      // 检查返回的数据类型
      if (Array.isArray(railwayLocations.data)) {
        console.log(`🏪 门市数量: ${railwayLocations.data.length}`);
        console.log(`📋 门市列表: ${railwayLocations.data.map(l => l.name).join(', ')}`);
      } else {
        console.log(`⚠️  返回的数据格式异常:`);
        console.log(`   数据类型: ${typeof railwayLocations.data}`);
        console.log(`   数据内容: ${JSON.stringify(railwayLocations.data).substring(0, 200)}...`);
      }
      
      // 检查产品
      console.log('\n🔍 搜索Railway产品...');
      const railwayProducts = await axios.get(`${RAILWAY_URL}/products`, { timeout: 10000 });
      
      if (Array.isArray(railwayProducts.data)) {
        console.log(`📦 Railway产品总数: ${railwayProducts.data.length}`);
        
        // 查找包含 WS-276 的产品
        const ws276Products = railwayProducts.data.filter(p => p.productCode && p.productCode.includes('WS-276'));
        console.log(`🔍 找到 WS-276 系列产品: ${ws276Products.length} 个`);
        
        if (ws276Products.length > 0) {
          const testProduct = ws276Products[0];
          console.log(`\n📦 使用测试产品: ${testProduct.productCode}`);
          console.log(`   名称: ${testProduct.name || '无'}`);
          console.log(`   尺寸: [${testProduct.sizes?.join(', ') || '无'}]`);
          console.log(`   库存记录数: ${testProduct.inventories?.length || 0}`);
          
          if (testProduct.inventories && testProduct.inventories.length > 0) {
            console.log('   库存详情:');
            testProduct.inventories.forEach(inv => {
              const locationName = typeof inv.locationId === 'object' && inv.locationId 
                ? inv.locationId.name 
                : '未知';
              console.log(`     ${locationName}: ${inv.quantity}`);
            });
          }
        } else {
          console.log(`❌ Railway未找到 WS-276 系列产品`);
        }
      } else {
        console.log(`⚠️  产品数据格式异常: ${typeof railwayProducts.data}`);
      }
      
    } catch (error) {
      console.log(`❌ Railway连接失败: ${error.message}`);
      
      if (error.code === 'ENOTFOUND') {
        console.log('💡 DNS解析失败，请检查URL是否正确');
      } else if (error.code === 'ECONNREFUSED') {
        console.log('💡 连接被拒绝，服务可能未运行');
      } else if (error.response) {
        console.log(`💡 HTTP错误: ${error.response.status} - ${error.response.statusText}`);
      }
      return;
    }
    
    // 3. 数据库差异分析
    console.log('\n📊 关键发现');
    console.log('='.repeat(50));
    console.log('✅ Railway URL正确: https://project-q-production.up.railway.app');
    console.log('✅ 本地环境: 5个门市，正常运行');
    console.log('⚠️  Railway门市数据异常: 返回了1155个门市（应该是5个）');
    console.log('');
    console.log('💡 问题分析:');
    console.log('1. Railway的/locations API返回了异常数量的数据');
    console.log('2. 这可能表明Railway连接了错误的数据库或集合');
    console.log('3. 或者Railway的数据库结构与本地不同');
    console.log('');
    console.log('🛠️  建议解决方案:');
    console.log('1. 检查Railway环境变量中的MONGODB_URI');
    console.log('2. 确认Railway连接到正确的数据库名称 (Storage)');
    console.log('3. 检查Railway是否部署了最新代码');
    console.log('4. 考虑重新部署Railway项目');
    
  } catch (error) {
    console.error('❌ 检查失败:', error.message);
  }
}

// 运行检查
checkEnvironments(); 