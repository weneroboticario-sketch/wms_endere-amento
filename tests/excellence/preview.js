import { mountExcellence } from '/src/excellence/view.js';
const root = document.getElementById('root'), actor = document.getElementById('actor');
let generation = 0;
async function render() {
 const ownGeneration = ++generation, selected = actor.value;
 const service = { async rpc(action, data = {}) {
  const response = await fetch('/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actor: selected, action, data }) });
  const result = await response.json(); if (!response.ok) throw Error(result.error);
  if (ownGeneration !== generation) throw Error('Perfil alterado.'); return result;
 } };
 try { await mountExcellence(root, { service, actorId: selected, leader: selected !== 'op', admin: selected === 'admin' }); }
 catch (error) { if (ownGeneration === generation) root.textContent = error.message; }
}
actor.onchange = render; void render();
