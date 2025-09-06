const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

async function testImport() {
  try {
    const form = new FormData();
    form.append('locationId', '68b69280b1d2c305a47d09cf');
    form.append('files', fs.createReadStream('../貨存調動紀錄.pdf'));
    
    const response = await fetch('http://localhost:4001/api/import/incoming', {
      method: 'POST',
      body: form
    });
    
    const result = await response.json();
    console.log('導入結果:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('錯誤:', error);
  }
}

testImport();
