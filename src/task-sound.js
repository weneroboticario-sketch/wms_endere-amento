// Playback only: task notification timing and visual alerts remain with the caller.
export function createTaskSound({ getUser, storage, createContext, key = 'wms_task_sound_enabled_v1' }) {
 let actor, preferences, playing, generation = 0;
 const clamp = value => Number.isFinite(Number(value)) ? Math.min(1,Math.max(0,Number(value))) : 0.9;
 function stop() {
  ++generation;
  const sound=playing; playing=null;
  if (!sound) return;
  for (const oscillator of sound.oscillators) { try { oscillator.stop(); oscillator.disconnect(); } catch { /* already ended */ } }
  try { sound.master.disconnect(); } catch { /* disconnected */ }
  try { Promise.resolve(sound.context.close()).catch(()=>{}); } catch { /* unavailable */ }
 }
 function current() {
  const next=String(getUser() || '');
  if (next!==actor || !preferences) {
   stop(); actor=next; preferences={enabled:true,volume:0.9};
   try { const saved=JSON.parse(storage.getItem(key+':'+actor)||'null'); if (saved && actor) preferences={enabled:typeof saved.enabled==='boolean'?saved.enabled:true,volume:clamp(saved.volume ?? 0.9)}; } catch { /* in-memory preferences still work */ }
  }
  return {...preferences,enabled:!!actor && preferences.enabled};
 }
 function set(change) {
  current();
  if ('enabled' in change) preferences.enabled=!!change.enabled;
  if ('volume' in change) preferences.volume=clamp(change.volume);
  if (!preferences.enabled || !preferences.volume) stop();
  else if (playing) playing.master.gain.setValueAtTime(preferences.volume,playing.context.currentTime);
  try { if(actor) storage.setItem(key+':'+actor,JSON.stringify(preferences)); } catch { /* keep working without storage */ }
  return current();
 }
 async function play(kind = "task", peak = 0.55) {
  const tone = kind === "replenishment"
   ? { frequencies: [760, 1040], type: "square", spacing: 0.1, fade: 0.095, duration: 0.11, peak: Math.min(0.55, clamp(peak)) }
   : { frequencies: [740, 990], type: "sine", spacing: 0.2, fade: 0.18, duration: 0.19, peak: 0.55 };
  const settings=current();
  if (!settings.enabled || !settings.volume) return false;
  stop(); const version=generation, user=actor;
  try {
   const context=createContext(),master=context.createGain();
   const sound={context,master,oscillators:[]};playing=sound;
   master.gain.setValueAtTime(settings.volume,context.currentTime); master.connect(context.destination);
   if(context.state==='suspended') await context.resume();
   const latest=current();
   if(version!==generation || user!==actor || !latest.enabled || !latest.volume) { if(playing===sound)stop(); return false; }
   // Both alerts share the same user volume and immediate mute control.
   tone.frequencies.forEach((frequency,index)=>{
    const oscillator=context.createOscillator(),gain=context.createGain(),start=context.currentTime+index*tone.spacing;
    sound.oscillators.push(oscillator);oscillator.type=tone.type;oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(0.001,start);gain.gain.exponentialRampToValueAtTime(tone.peak,start+0.015);gain.gain.exponentialRampToValueAtTime(0.001,start+tone.fade);
    oscillator.connect(gain);gain.connect(master);oscillator.start(start);oscillator.stop(start+tone.duration);
    if(index===1)oscillator.onended=()=>{if(playing===sound)stop();};
   });
   return true;
  } catch { if(version===generation)stop(); return false; }
 }
 function reload() { preferences = null; return current(); }
 return {current,set,play,stop,reload};
}
