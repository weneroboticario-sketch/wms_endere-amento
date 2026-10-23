import test from "node:test";
import assert from "node:assert/strict";
import { activeAddressingPeers, createAddressingPresence } from "../src/addressing-presence.js";

const now = 1000000;
const peer = changes => ({ userId: "other", userName: "Colega", sessionId: "session", activityId: "activity", activity: "addressing", warehouse: "VDCG", updatedAt: now, ...changes });

test("only current addressing peers in the same warehouse are visible", () => {
  const state = { clients: [peer({}), peer({ userId: "self" }), peer({ warehouse: "VDAR" }), peer({ updatedAt: now - 91000 }), peer({ activity: "idle" })] };
  assert.equal(activeAddressingPeers(state, "VDCG", "self", [], now).length, 1);
  assert.equal(activeAddressingPeers(state, "VDCG", "self", ["session:activity"], now).length, 0);
  assert.equal(activeAddressingPeers({ clients: [peer({ activityId: "new-activity" })] }, "VDCG", "self", ["session:activity"], now).length, 1);
});

test("multiple tabs are acknowledged together", () => {
  const peers = activeAddressingPeers({ clients: [peer({}), peer({ sessionId: "second" })] }, "VDCG", "self", [], now);
  assert.equal(peers.length, 1);
  assert.deepEqual(peers[0].acknowledgementKeys, ["session:activity", "second:activity"]);
});

test("OK stays dismissed through sync and refresh, while a new activity is announced", async () => {
  const saved = new Map();
  const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  const state = { clients: [peer({})] };
  let subscribe;
  let sync;
  let tick;
  let currentTime = now;
  const tracks = [];
  let untracks = 0;
  const listeners = new Map();
  const element = { children: [], hidden: true, replaceChildren() { this.children = []; }, append(...children) { this.children.push(...children); } };
  const document = {
    visibilityState: "visible",
    createElement: () => ({ addEventListener(_event, callback) { this.click = callback; } }),
    addEventListener: (event, callback) => listeners.set(event, callback),
    removeEventListener: event => listeners.delete(event)
  };
  const channel = {
    on(_event, _filter, callback) { sync = callback; return this; },
    subscribe(callback) { subscribe = callback; return this; },
    presenceState: () => state,
    track: async payload => { tracks.push(payload); return "ok"; },
    untrack: async () => { untracks += 1; return "ok"; }
  };
  const options = {
    client: { channel: (topic, config) => { assert.equal(topic, "wms-addressing:VDCG"); assert.equal(config.config.private, true); return channel; }, removeChannel: async () => {} },
    warehouse: "VDCG", user: { id: "self", name: "Eu" }, element, storage, document,
    isAddressing: () => true, now: () => currentTime, randomId: () => "own-session",
    timers: { setInterval: callback => { tick = callback; return 1; }, clearInterval: () => {} }
  };
  const controller = createAddressingPresence(options);
  subscribe("SUBSCRIBED");
  await Promise.resolve();
  assert.equal(element.hidden, false);
  assert.match(element.children[0].textContent, /Colega.*VDCG/);
  element.children[1].click();
  sync();
  assert.equal(element.hidden, true);
  state.clients[0].updatedAt += 1000;
  sync();
  assert.equal(element.hidden, true);
  controller.stop();
  const refreshed = createAddressingPresence(options);
  subscribe("SUBSCRIBED");
  await Promise.resolve();
  assert.equal(element.hidden, true);
  state.clients[0].activityId = "new-period";
  sync();
  assert.equal(element.hidden, false);
  currentTime += 121000;
  tick();
  await Promise.resolve();
  assert.ok(untracks > 0);
  assert.ok(tracks.length > 0);
  refreshed.stop();
  assert.equal(listeners.size, 0);
  assert.equal(element.hidden, true);
});
