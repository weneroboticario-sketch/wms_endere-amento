import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {hasPulmaoBase,summarizePulmao,buildPulmaoSeparationRows} from "../src/pulmao-stock.js";
const source=await readFile(new URL("../script.js",import.meta.url),"utf8");
test("Pulmao enabled only in the two requested warehouses",()=>{
  assert.equal(hasPulmaoBase("23696"),true);assert.equal(hasPulmaoBase("22796"),true);
  assert.equal(hasPulmaoBase("14177"),false);assert.equal(hasPulmaoBase("VDCG"),false);
});
test("Pulmao balances and locations stay separate from capture and store",()=>{
  const result=summarizePulmao([{sourceType:"PULMAO",codigoEndereco:"A",totalDisponivel:20},{sourceType:"PULMAO",codigoEndereco:"B",totalDisponivel:5},{sourceType:"CAPTACAO",totalDisponivel:100},{sourceType:"LOJA",totalDisponivel:30}]);
  assert.equal(result.available,25);assert.equal(result.locations,"A / B");assert.equal(result.rows.length,2);
  assert.equal(summarizePulmao([]).found,false);
});
test("Pulmao separation export preserves multiple addresses and SKU zeros",()=>{
  const data=[{sourceType:"PULMAO",codigoMaterial:"00178",codigoEndereco:"A",estacao:"PULMAO"},{sourceType:"PULMAO",codigoMaterial:"00178",codigoEndereco:"B"},{sourceType:"CAPTACAO",codigoMaterial:"999",codigoEndereco:"A"}];
  const rows=buildPulmaoSeparationRows(data,code=>({valid:true,code,rua:1,rack:1,linha:1,letra:"A"}),(...args)=>args);
  assert.equal(rows.length,2);assert.equal(rows[0][0],"PULMAO");assert.equal(rows[0][5],"00178");assert.equal(rows[1][5],"00178");
});
test("Pulmao spreadsheet parser retains address and balance without treating it as Loja",()=>{
  const context=vm.createContext({
    window:{XLSX:{utils:{sheet_to_json:()=>[{"Cod Material":"00178","Desc Material":"Product","Total disponivel":"25",Endereco:"R01-RK01-L01-A"}]}}},
    firstSkuValue:v=>v,normalizeText:v=>String(v||""),normalizeSku:v=>v,
    getByAliases:(row,names)=>names.map(k=>row[k]).find(v=>v!==undefined)||"",
    parseQuantity:v=>Number(v||0),buildStockImportLocation:(s,r,l,c,a)=>({valid:true,code:a}),
    stockImportRowHasLocationColumns:()=>true,stockImportRowMeansNoLocation:()=>false,isSellableStockProduct:()=>true,dedupeStockRows:(s,rows)=>rows
  });
  vm.runInContext(source.match(/  function parseStockWorkbook\([\s\S]*?\n  }/)[0],context);
  const parsed=context.parseStockWorkbook({SheetNames:["Pulmao"],Sheets:{Pulmao:{}}},"PULMAO");
  assert.equal(parsed.rows[0].codigoMaterial,"00178");assert.equal(parsed.rows[0].codigoEndereco,"R01-RK01-L01-A");assert.equal(parsed.rows[0].totalDisponivel,25);
});
test("Pulmao is not synchronized into capture addressing bindings",()=>{
  const sync=source.match(/  async function syncBindingsFromLocatedStockImport\([\s\S]*?\n  }/)[0];
  assert.match(sync,/if \(sourceType !== "CAPTACAO"\) return emptyResult/);
  const clear=source.match(/  async function clearBindingsForUnlocatedStockImport\([\s\S]*?\n  }/)[0];
  assert.match(clear,/sourceType !== "CAPTACAO"/);
});
