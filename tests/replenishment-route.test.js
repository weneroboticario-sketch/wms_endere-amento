import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { buildReplenishmentRoute, isReplenishmentVisibleInActiveQueue, loadActiveReplenishmentPages, matchesReplenishmentQueueFilter, replenishmentRouteAddress } from "../src/replenishment.js";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const functionSource = (name, next) => source.slice(source.indexOf("  function " + name + "("), source.indexOf("  function " + next + "("));
const parsers = vm.createContext({ pad2: value => String(value).padStart(2, "0") });
vm.runInContext(functionSource("normalizeLocation", "vdMaisColumnLabelToNumber") + functionSource("vdMaisColumnLabelToNumber", "numberToVdMaisColumnLabel"), parsers);
const { normalizeLocation, vdMaisColumnLabelToNumber: column } = parsers;
const request = (id, localizacaoWms, extra = {}) => ({ id, localizacaoWms, warehouseCode: "VDCG", prioridade: "NORMAL", status: "PENDENTE", codigoMaterial: "48606", requestedQty: 2, ...extra });
const address = item => replenishmentRouteAddress(item, normalizeLocation, column);
const route = items => buildReplenishmentRoute(items, "VDCG", address, column);
const ids = items => route(items).map(entry => entry.item.id);

test("route follows numerical street, rack and line, then physical column", () => {
  const items = [
    request("rua3", "R03-RK01-L01-A"), request("rua2", "R02-RK01-L01-A"),
    request("rack10", "R01-RK10-L01-A"), request("rack2", "R01-RK02-L01-A"),
    request("line2", "R01-RK01-L02-A"), request("columnB", "R01-RK01-L01-B"), request("columnA", "R01-RK01-L01-A")
  ];
  assert.deepEqual(ids(items), ["columnA", "columnB", "line2", "rack2", "rack10", "rua2", "rua3"]);
});

test("client priority crosses statuses, and unknown addresses follow located requests in each priority", () => {
  assert.deepEqual(ids([
    request("normal-empty", ""), request("normal", "R01-RK01-L01-A"),
    request("urgent-empty", "", { prioridade: "CLIENTE", status: "ATRIBUIDO" }),
    request("urgent", "R03-RK01-L01-A", { prioridade: "CLIENTE", status: "EM_SEPARACAO" })
  ]), ["urgent", "urgent-empty", "normal", "normal-empty"]);
});

test("equivalent streets share a numeric key and a separation station is not a street", () => {
  const withParts = (id, station, rack) => request(id, "", { captacaoEstacao: station, captacaoRack: rack, captacaoLinha: "Linha 01", captacaoColuna: "A" });
  const items = [withParts("third", "RUA-001", "Rack 10"), withParts("second", "Rua 01", "Rack 2"), withParts("first", "Rua 1", "Rack 1")];
  assert.deepEqual(ids(items), ["first", "second", "third"]);
  assert.equal(address(withParts("station", "LS54", "Rack 1")), null);
  assert.equal(address(withParts("alpha", "Rua A2", "Rack 1")).rua, "A2");
});

test("request's selected address and original code are used without cloning SKU, quantity or status", () => {
  const row = Object.freeze(request("selected", "R03-RK02-L01-A", { requestedQty: 8, status: "ATRIBUIDO" }));
  const sameSku = request("other", "R01-RK01-L01-A");
  const items = route([row, sameSku, request("foreign", "R01-RK01-L01-A", { warehouseCode: "VDAR" })]);
  assert.deepEqual(items.map(entry => entry.item.id), ["other", "selected"]);
  assert.equal(items[1].item, row);
  assert.equal(items[1].address.code, row.localizacaoWms);
  assert.equal(row.requestedQty, 8);
  assert.equal(row.status, "ATRIBUIDO");
});

test("global order is applied after fetching pages, then filters and visible limits preserve the route", async () => {
  const a = request("a", "R03-RK01-L01-A", { status: "EM_SEPARACAO" });
  const b = request("b", "R01-RK01-L01-A", { status: "SEPARADO" });
  const c = request("c", "R02-RK01-L01-A", { status: "CONCLUIDO" });
  const pages = new Map([[null, [a]], ["a", [b]], ["b", [c]], ["c", []]]);
  const items = await loadActiveReplenishmentPages(async after => ({ data: pages.get(after) }), () => true, 1);
  const filtered = items.filter(item => isReplenishmentVisibleInActiveQueue(item) && matchesReplenishmentQueueFilter(item, "EM_SEPARACAO"));
  assert.deepEqual(ids(filtered).slice(0, 1), ["b"]);
  assert.deepEqual(ids([...filtered, request("new", "R02-RK01-L01-A")]), ["b", "new", "a"]);
  let current = true;
  assert.equal(await loadActiveReplenishmentPages(async () => { current = false; return { data: [a] }; }, () => current, 1), null);
});
