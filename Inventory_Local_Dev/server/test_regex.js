const codePattern = /(?:[A-Z]{1,8}[\-]?\d{2,8}[A-Za-z\/]*)|(?:\b\d{8,14}\b)/;
const testCode = "WS-409PBK/LB";
console.log('測試代碼:', testCode);
console.log('正則匹配結果:', codePattern.test(testCode));
console.log('匹配內容:', testCode.match(codePattern));
