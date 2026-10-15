import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {expeditionActions} from "../src/expedition-workflow.js";
const source=readFileSync(new URL("../script.js",import.meta.url),"utf8");
const access=source.slice(source.indexOf("function canAccessScreen(screenId)"),source.indexOf("function fromDbUser(row)"));

test("Dashboard opens the consolidated view in CP overview without choosing a store",async()=>{
  const start=source.indexOf("async function showScreen(screenId)");
  const routing=source.slice(start,source.indexOf("    if (isRemovedScreen(screenId))",start))+"return screenId;}";
  for(const [cp,global,screen,expected] of [[true,true,"dashboard","globalDashboard"],[true,false,"dashboard","dashboard"],[false,true,"dashboard","dashboard"]]){
    const actual=await runInNewContext(routing+';showScreen("'+screen+'")',{
      IS_CP_ALAMO:cp,authState:{currentUser:{role:"ADMINISTRADOR"}},isAdmin:()=>true,isGlobalDashboardScope:()=>global,
      showToast:()=>{throw new Error("Dashboard must not require a store");}
    });
    assert.equal(actual,expected);
  }
});
test("CP administrator can open all active modules including transport in overview scope",()=>{
  for(const screen of ["usuarios","estoques","manutencao","transferencias","reposicao","bipagem","baseEstoque","expedition","fiscalWorkflow","reverseLogistics"]){
    const allowed=runInNewContext(access+`;canAccessScreen(${JSON.stringify(screen)})`,{IS_CP_ALAMO:true,authState:{currentUser:{role:"ADMINISTRADOR"}},isAdmin:()=>true,isGlobalDashboardScope:()=>true});
    assert.equal(allowed,true,screen);
  }
});
test("administrator can perform transport actions even if another colleague owns expedition",()=>{
  const user={id:"admin",role:"ADMINISTRADOR"};
  for(const [stage,action] of [["ATRIBUIDA","COLLECT"],["COLETADA","TRANSIT"],["EM_TRANSITO","DELIVER"],["ENTREGA_COM_DIVERGENCIA","RESOLVE"]]){
    assert.ok(expeditionActions({expedition_stage:stage,expedition_responsible_id:"other"},user).some(([id])=>id===action));
  }
  assert.deepEqual(expeditionActions({expedition_stage:"EM_TRANSITO",expedition_responsible_id:"other"},{id:"operator",role:"OPERADOR"}),[]);
});
