import test from "node:test";
import assert from "node:assert/strict";
import { interpretWhatsAppMessage } from "../src/whatsapp-message.js";

test("five products retain volumes and names without inventing assignments", () => {
  const result = interpretWhatsAppMessage(`83823 OUI LOC DES HID CPO MADELEINE 400ml 6 UNID
95830 O.U.i Madeleine 862 La Chocolatine Eau de Parfum 75ml 4 UBID
85828 OUI EDP LEXPERIENCE V2 75ml 2 UBID
58716 OUI EDP LE CHARMEUR 250 75ml 2 UNID
83844 OUI EDP RIVIERE BLEUE 75ml 1 UNID ARTHUR`);
  assert.deepEqual(result.lines.map(line => line.quantity), [6, 4, 2, 2, 1]);
  assert.equal(result.lines.reduce((sum, line) => sum + line.quantity, 0), 15);
  assert.match(result.lines[4].observation, /ARTHUR/);
  assert.equal(result.lines[4].assignedTo, undefined);
});

test("customer priority applies only to the corresponding SKU and preserves source order within a tier", () => {
  const result = interpretWhatsAppMessage(`84862 EUD MAKE BAT HID K/M MALV/MOD V4 3,7g 10 UNID GI, CLIE
84864 EUD MAKE BAT HID K/M ROSA ATITUD V4 3,7g 10 UNID
84861 EUD MAKE BAT HID K/M LOOK/DIA V4 3,7g 1 UNID
86524 EUD MAKE BAT HID K/M MARROM DESFILE 3,7g 1 UNID
84859 EUD MAKE BAT HID K/M AVELA V5 3,7g 1 UNID GI CLIE`);
  assert.deepEqual(result.lines.map(line => line.sku), ["84862", "84859", "84864", "84861", "86524"]);
  assert.equal(result.lines.filter(line => line.client).length, 2);
  assert.equal(result.lines.reduce((sum, line) => sum + line.quantity, 0), 23);
});

test("missing, ambiguous and invalid quantities require review", () => {
  for (const text of ["54150 Produto 250ml V2 6x0,04g", "54150 Produto 2 UN 3 UN", "54150 Produto 0 UN", "54150 Produto 1,5 UN"]) {
    assert.equal(interpretWhatsAppMessage(text).lines[0].confidence, "REVIEW");
  }
});

test("adjustment quantities never imply movement direction", () => {
  for (const text of ["Ajuste 86227 2 unidades", "Produto código 57500 AJUSTE 1UN"]) {
    const line = interpretWhatsAppMessage(text).lines[0];
    assert.equal(line.kind, "ADJUSTMENT");
    assert.equal(line.confidence, "REVIEW");
    assert.equal(line.direction, undefined);
  }
});

test("responses, quotes, repeated codes and leading zeroes are handled conservatively", () => {
  for (const response of ["feito", "Continua pedindo ajuste", "tenta novamente", "Tá vindo?", "Não temos"]) {
    assert.equal(interpretWhatsAppMessage(response).lines.length, 0);
  }
  const result = interpretWhatsAppMessage("> 54150 produto 2 UN\n00.123 Produto 1 UNI\n00123 Produto 2 UN CLIENTE");
  assert.deepEqual(result.lines.map(line => line.sku), ["00123", "00123"]);
  assert.equal(result.lines[0].confidence, "REVIEW");
  assert.match(result.review[0], /citação/);
});

test("original text is preserved and oversized messages are rejected", () => {
  const original = "54150 <script>alert(1)</script> 1 UN";
  assert.equal(interpretWhatsAppMessage(original).original, original);
  assert.throws(() => interpretWhatsAppMessage("x".repeat(20001)), /20.000/);
  assert.equal(interpretWhatsAppMessage("54150 produto CLINICA 1 UN").lines[0].client, false);
});

test("WhatsApp formatted numbers are explicit quantities without changing original audit text", () => {
  for (const value of ["*1*", "**1**", "_1_", "__1__", "~1~"]) {
    const original = `54150 Produto demonstrativo 250ml 1 UNID CLIE\n54150 Produto demonstrativo 250ml ${value} UN CLIENTE`;
    const result = interpretWhatsAppMessage(original);
    assert.deepEqual(result.lines.map(line => line.quantity),[1,1]);
    assert.equal(result.original,original);
    assert.equal(result.lines[1].original,original.split("\n")[1]);
    assert.equal(result.lines[1].confidence,"REVIEW");
  }
  assert.equal(interpretWhatsAppMessage("*54150* Produto 75ml *2*UN").lines[0].quantity,2);
  assert.equal(interpretWhatsAppMessage("54150 Produto 75ml *2 UN").lines[0].quantity,null);
});
