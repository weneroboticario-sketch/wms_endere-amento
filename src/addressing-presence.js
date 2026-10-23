const IDLE_MS = 120000;
const EXPIRY_MS = 90000;

export function activeAddressingPeers(state, warehouse, userId, acknowledged = [], now = Date.now()) {
  const peers = new Map();
  for (const entry of Object.values(state || {}).flat()) {
    const age = now - Number(entry.updatedAt);
    if (entry.warehouse !== warehouse || entry.userId === userId || entry.activity !== "addressing" ||
        !entry.activityId || !entry.sessionId || !Number.isFinite(age) || age < -30000 || age > EXPIRY_MS) continue;
    const key = entry.sessionId + ":" + entry.activityId;
    if (acknowledged.includes(key)) continue;
    const existing = peers.get(entry.userId);
    peers.set(entry.userId, { ...entry, acknowledgementKeys: [...(existing?.acknowledgementKeys || []), key] });
  }
  return [...peers.values()];
}

export function createAddressingPresence({ client, warehouse, user, element, isAddressing, storage = globalThis.sessionStorage, document = globalThis.document, timers = globalThis, now = Date.now, randomId = () => globalThis.crypto.randomUUID() }) {
  const sessionId = randomId();
  const storageKey = "wms-addressing-ack:" + warehouse + ":" + user.id;
  let acknowledged = [];
  try { acknowledged = JSON.parse(storage.getItem(storageKey) || "[]"); } catch { acknowledged = []; }
  if (!Array.isArray(acknowledged)) acknowledged = [];
  let activityId = "";
  let lastActivity = 0;
  let lastPublished = 0;
  let subscribed = false;
  let stopped = false;
  let pending = false;
  let rerun = false;
  let peers = [];
  let renderedSignature = "";
  const channel = client.channel("wms-addressing:" + warehouse, { config: { private: true, presence: { key: sessionId } } });

  function render() {
    if (stopped) { element.hidden = true; return; }
    peers = activeAddressingPeers(channel.presenceState(), warehouse, user.id, acknowledged, now());
    element.hidden = !subscribed || !peers.length;
    if (element.hidden) return;
    const signature = JSON.stringify(peers.map(peer => [peer.userId, peer.userName, peer.acknowledgementKeys]));
    if (signature === renderedSignature) return;
    renderedSignature = signature;
    element.replaceChildren();
    const message = document.createElement("span");
    message.textContent = peers.map(peer => peer.userName || "Colaborador").join(", ") +
      (peers.length === 1 ? " está endereçando" : " estão endereçando") + " no estoque " + warehouse + ".";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = "OK";
    button.addEventListener("click", () => {
      acknowledged = [...new Set([...acknowledged, ...peers.flatMap(peer => peer.acknowledgementKeys)])].slice(-500);
      try { storage.setItem(storageKey, JSON.stringify(acknowledged)); } catch { render(); return; }
      render();
    });
    element.append(message, button);
  }

  async function publish() {
    if (stopped || !subscribed) return;
    if (pending) { rerun = true; return; }
    pending = true;
    try {
      const active = isAddressing() && document.visibilityState !== "hidden" && now() - lastActivity < IDLE_MS;
      if (!active && activityId) {
        await channel.untrack();
        activityId = "";
        lastPublished = 0;
      } else if (active && (!activityId || now() - lastPublished >= 30000)) {
        if (!activityId) activityId = randomId();
        const result = await channel.track({ sessionId, activityId, userId: user.id, userName: user.name || user.username || "Colaborador", warehouse, activity: "addressing", updatedAt: now() });
        if (result === "ok") lastPublished = now();
      }
    } catch {
      lastPublished = 0;
    } finally {
      pending = false;
      if (rerun) { rerun = false; void publish(); }
    }
  }

  function activity() {
    if (isAddressing() && document.visibilityState !== "hidden") lastActivity = now();
    void publish();
  }
  function visibility() {
    if (document.visibilityState !== "hidden") activity();
    else void publish();
  }
  channel.on("presence", { event: "sync" }, render).subscribe(status => {
    if (stopped) return;
    subscribed = status === "SUBSCRIBED";
    if (!subscribed) { element.hidden = true; return; }
    lastPublished = 0;
    activity();
    render();
  });
  document.addEventListener("keydown", activity);
  document.addEventListener("pointerdown", activity);
  document.addEventListener("visibilitychange", visibility);
  const interval = timers.setInterval(() => { void publish(); render(); }, 15000);

  return {
    update: activity,
    stop() {
      stopped = true;
      subscribed = false;
      timers.clearInterval(interval);
      document.removeEventListener("keydown", activity);
      document.removeEventListener("pointerdown", activity);
      document.removeEventListener("visibilitychange", visibility);
      element.hidden = true;
      element.replaceChildren();
      void client.removeChannel(channel);
    }
  };
}
