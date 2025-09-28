const fs = require('fs');
const path = require('path');

// 测试改进的门市对调PDF解析功能
async function testImprovedTransfer() {
  try {
    console.log('🔍 测试改进的门市对调PDF解析功能...\n');
    
    // PDF文件路径
    const pdfPath = path.join(__dirname, '(抓毛倉)  WC 貨存調動紀錄 TRN003670.pdf');
    
    if (!fs.existsSync(pdfPath)) {
      console.log('❌ PDF文件不存在:', pdfPath);
      return;
    }
    
    console.log('📄 PDF文件:', pdfPath);
    console.log('📊 文件大小:', (fs.statSync(pdfPath).size / 1024).toFixed(2), 'KB\n');
    
    // 准备测试数据
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(pdfPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    
    formData.append('files', blob, '(抓毛倉)  WC 貨存調動紀錄 TRN003670.pdf');
    formData.append('fromLocationId', '66e6a9e4b1234567890abcde'); // 假设的来源门市ID
    formData.append('toLocationId', '66e6a9e4b1234567890abcdf');   // 假设的目标门市ID
    
    console.log('🚀 发送门市对调请求...');
    
    const response = await fetch('http://localhost:4001/api/import/transfer', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ 请求失败:', response.status, response.statusText);
      console.log('错误详情:', errorText);
      return;
    }
    
    const result = await response.json();
    
    console.log('\n📊 门市对调结果:');
    console.log('='.repeat(50));
    console.log(`📁 处理文件数: ${result.files}`);
    console.log(`📦 提取产品数: ${result.processed}`);
    console.log(`✅ 匹配成功数: ${result.matched}`);
    console.log(`🔄 更新成功数: ${result.updated}`);
    console.log(`❌ 未找到产品数: ${result.notFound?.length || 0}`);
    console.log(`⚠️  错误数量: ${result.errors?.length || 0}`);
    
    if (result.notFound && result.notFound.length > 0) {
      console.log('\n❌ 未找到的产品:');
      result.notFound.forEach((code, index) => {
        console.log(`  ${index + 1}. ${code}`);
      });
    }
    
    if (result.errors && result.errors.length > 0) {
      console.log('\n⚠️  错误信息:');
      result.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
    
    if (result.parsed && result.parsed.length > 0) {
      console.log('\n📋 解析的产品列表:');
      console.log('-'.repeat(60));
      console.log('产品代码'.padEnd(15) + '尺寸'.padEnd(10) + '数量'.padEnd(8) + '状态');
      console.log('-'.repeat(60));
      
      result.parsed.forEach(item => {
        const status = result.notFound.includes(item.code) ? '❌未找到' : '✅已匹配';
        console.log(
          item.code.padEnd(15) + 
          item.size.padEnd(10) + 
          item.qty.toString().padEnd(8) + 
          status
        );
      });
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ 测试完成');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 请确保本地服务器已启动 (npm run dev)');
    }
  }
}

// 检查服务器是否运行
async function checkServer() {
  try {
    const response = await fetch('http://localhost:4001/api/locations');
    if (response.ok) {
      console.log('✅ 本地服务器运行正常\n');
      return true;
    } else {
      console.log('❌ 服务器响应异常:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ 无法连接到本地服务器');
    console.log('💡 请运行: npm run dev');
    return false;
  }
}

// 主函数
async function main() {
  console.log('🧪 门市对调功能改进测试\n');
  
  const serverRunning = await checkServer();
  if (serverRunning) {
    await testImprovedTransfer();
  }
}

// 运行测试
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testImprovedTransfer, checkServer }; 