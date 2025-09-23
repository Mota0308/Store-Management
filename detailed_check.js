// 详细诊断本地和Railway环境
const axios = require('axios');

async function detailedCheck() {
  console.log('🔍 详细诊断环境问题...\n');
  
  const LOCAL_URL = 'http://localhost:4001';
  const RAILWAY_BASE = 'https://project-q-production.up.railway.app';
  
  // 1. 检查本地服务器
  console.log('🏠 检查本地服务器...');
  console.log('='.repeat(60));
  
  try {
    // 检查本地根路径
    console.log('📡 测试本地根路径...');
    const localRoot = await axios.get(LOCAL_URL, { timeout: 5000 });
    console.log(`✅ 本地根路径响应: ${localRoot.status}`);
    console.log(`   内容类型: ${localRoot.headers['content-type']}`);
    console.log(`   内容长度: ${localRoot.data.length} 字符`);
    
    // 检查本地API
    console.log('\n📡 测试本地API...');
    const localAPI = await axios.get(`${LOCAL_URL}/api/locations`, { timeout: 5000 });
    console.log(`✅ 本地API响应: ${localAPI.status}`);
    console.log(`   门市数量: ${localAPI.data.length}`);
    console.log(`   门市列表: ${localAPI.data.map(l => l.name).join(', ')}`);
    
    // 检查本地产品
    console.log('\n📡 测试本地产品API...');
    const localProducts = await axios.get(`${LOCAL_URL}/api/products`, { timeout: 5000 });
    console.log(`✅ 本地产品API响应: ${localProducts.status}`);
    console.log(`   产品总数: ${localProducts.data.length}`);
    
    if (localProducts.data.length > 0) {
      const sampleProduct = localProducts.data[0];
      console.log(`   示例产品: ${sampleProduct.productCode} - ${sampleProduct.name}`);
      console.log(`   尺寸: [${sampleProduct.sizes?.join(', ') || '无'}]`);
      console.log(`   库存记录: ${sampleProduct.inventories?.length || 0}`);
    } else {
      console.log(`⚠️  本地数据库没有产品数据！`);
    }
    
  } catch (error) {
    console.log(`❌ 本地服务器检查失败: ${error.message}`);
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 本地服务器未运行，请执行: npm run dev');
    }
  }
  
  // 2. 检查Railway服务器
  console.log('\n🚀 检查Railway服务器...');
  console.log('='.repeat(60));
  
  try {
    // 检查Railway根路径
    console.log('📡 测试Railway根路径...');
    const railwayRoot = await axios.get(RAILWAY_BASE, { timeout: 10000 });
    console.log(`✅ Railway根路径响应: ${railwayRoot.status}`);
    console.log(`   内容类型: ${railwayRoot.headers['content-type']}`);
    console.log(`   内容长度: ${railwayRoot.data.length} 字符`);
    
    if (railwayRoot.headers['content-type']?.includes('text/html')) {
      console.log('📄 Railway返回HTML页面（前端应用）');
    } else {
      console.log('📊 Railway返回数据');
    }
    
    // 检查Railway API
    console.log('\n📡 测试Railway API...');
    const railwayAPI = await axios.get(`${RAILWAY_BASE}/api/locations`, { timeout: 10000 });
    console.log(`✅ Railway API响应: ${railwayAPI.status}`);
    console.log(`   内容类型: ${railwayAPI.headers['content-type']}`);
    
    if (railwayAPI.headers['content-type']?.includes('application/json')) {
      console.log(`   门市数量: ${railwayAPI.data.length}`);
      console.log(`   门市列表: ${railwayAPI.data.map(l => l.name).join(', ')}`);
    } else {
      console.log('⚠️  Railway API返回非JSON数据');
      console.log(`   返回内容: ${railwayAPI.data.substring(0, 200)}...`);
    }
    
  } catch (error) {
    console.log(`❌ Railway服务器检查失败: ${error.message}`);
    
    if (error.response) {
      console.log(`   HTTP状态: ${error.response.status}`);
      console.log(`   内容类型: ${error.response.headers['content-type']}`);
      
      if (error.response.status === 404) {
        console.log('💡 API端点不存在，可能Railway部署配置有问题');
      }
    }
  }
  
  // 3. 检查Railway部署状态
  console.log('\n🔍 Railway部署分析');
  console.log('='.repeat(60));
  
  try {
    // 尝试不同的API路径
    const apiPaths = ['/api', '/api/locations', '/server/api/locations'];
    
    for (const path of apiPaths) {
      try {
        console.log(`🔍 测试路径: ${RAILWAY_BASE}${path}`);
        const response = await axios.get(`${RAILWAY_BASE}${path}`, { 
          timeout: 5000,
          validateStatus: () => true // 接受所有状态码
        });
        
        console.log(`   状态: ${response.status}`);
        console.log(`   类型: ${response.headers['content-type']}`);
        
        if (response.status === 200 && response.headers['content-type']?.includes('application/json')) {
          console.log(`✅ 找到有效API端点: ${path}`);
          console.log(`   数据: ${JSON.stringify(response.data).substring(0, 100)}...`);
          break;
        }
        
      } catch (error) {
        console.log(`   ❌ ${path}: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.log(`❌ Railway部署分析失败: ${error.message}`);
  }
  
  // 4. 总结和建议
  console.log('\n📊 诊断总结');
  console.log('='.repeat(60));
  console.log('🔍 主要问题:');
  console.log('1. Railway可能部署了前端应用而不是后端API');
  console.log('2. 本地数据库可能缺少产品数据');
  console.log('3. Railway的API路由配置可能有问题');
  console.log('');
  console.log('🛠️  解决方案:');
  console.log('1. 检查Railway部署配置，确保部署的是完整的全栈应用');
  console.log('2. 确认Railway环境变量配置正确');
  console.log('3. 重新部署Railway项目');
  console.log('4. 检查本地数据库是否有完整的产品数据');
  console.log('5. 如果本地数据库为空，先导入一些测试数据');
}

// 运行诊断
detailedCheck(); 