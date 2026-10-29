import test from "node:test";
import assert from "node:assert/strict";
import { createCaixaUnread } from "../src/caixa-unread.js";

function memory() { const values=new Map(); return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)}; }
const message=(id,request_id="a",sender_id="stock")=>({id,request_id,sender_id,warehouse_code:"VDCG"});
test("existing messages are unread on first opening and are acknowledged only after reading the conversation",()=>{
  const storage=memory();const tracker=createCaixaUnread({actor:"cashier",warehouse:"VDCG",storage});
  assert.equal(tracker.unread([message(1),message(2)]).length,2);
  assert.equal(tracker.unread([message(1),message(2)]).length,2);
  tracker.acknowledge("a",[message(1),message(2)]);
  const reopened=createCaixaUnread({actor:"cashier",warehouse:"VDCG",storage});
  assert.equal(reopened.unread([message(1),message(2)]).length,0);
  assert.equal(reopened.unread([message(1),message(2),message(3)]).length,1);
});
test("reading one request cannot mark another request or another user or warehouse as read",()=>{
  const storage=memory();const tracker=createCaixaUnread({actor:"cashier",warehouse:"VDCG",storage});
  tracker.acknowledge("a",[message(10),message(20,"b")]);
  assert.deepEqual(tracker.unread([message(10),message(20,"b"),message(21,"a","cashier")]).map(item=>item.id),[20]);
  assert.equal(createCaixaUnread({actor:"other-cashier",warehouse:"VDCG",storage}).unread([message(10)]).length,1);
  assert.equal(createCaixaUnread({actor:"cashier",warehouse:"VDAR",storage}).unread([{...message(10),warehouse_code:"VDAR"}]).length,1);
});
test("read marks synchronize between tabs and remain usable when browser storage is blocked",()=>{
  const storage=memory(),first=createCaixaUnread({actor:"cashier",warehouse:"VDCG",storage}),second=createCaixaUnread({actor:"cashier",warehouse:"VDCG",storage});
  first.acknowledge("a",[message(9)]);assert.equal(second.unread([message(9)]).length,0);
  const blocked=createCaixaUnread({actor:"cashier",warehouse:"VDCG",storage:{getItem(){throw Error("blocked");},setItem(){throw Error("blocked");}}});
  blocked.acknowledge("a",[message(9)]);assert.equal(blocked.unread([message(9)]).length,0);
});
test("message ordering does not lose precision for large PostgreSQL identifiers",()=>{
  const tracker=createCaixaUnread({actor:"cashier",warehouse:"VDCG",storage:memory()});
  tracker.acknowledge("a",[message("9007199254740992")]);
  assert.equal(tracker.unread([message("9007199254740993")]).length,1);
});
