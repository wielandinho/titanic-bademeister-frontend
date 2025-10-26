import React, { useEffect, useState } from 'react';
import './styles.css';

// Deine Apps-Script Web-App URL:
const API = 'https://script.google.com/macros/s/AKfycbwNztV3o25lGbDdCX8ziUI6ruJPuY6XcPcfJPHV3qiKMGyjf5q4RkGlOzbxt4xsYGQD/exec';
const DEFAULT_PW = 'Sieger';

/* ---------- Helpers ---------- */
async function fetchJSON(url, options){
  try{
    const res = await fetch(url, options);
    const txt = await res.text();
    try{ return { ok:true, data: JSON.parse(txt), raw: txt, status: res.status }; }
    catch{ return { ok:false, error:'invalid_json', raw:txt, status: res.status }; }
  }catch(e){ return { ok:false, error:String(e) }; }
}

async function apiCall(path, body){
  const url = API + '?path=' + encodeURIComponent(path);
  if (body){
    const form = new URLSearchParams(body).toString();
    return fetchJSON(url, {
      method:'POST',
      headers: { 'Content-Type':'application/x-www-form-urlencoded' },
      body: form
    });
  }
  return fetchJSON(url);
}

function initials(name=''){
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '🧑';
  const first = parts[0][0] || '';
  const last  = parts.length > 1 ? parts[parts.length-1][0] : '';
  return (first + last).toUpperCase();
}

/* ---------- Wikipedia image lookup with cache ---------- */
async function resolvePlayerImage(name){
  if (!name) return null;
  const key = 'tb_img_' + name.toLowerCase();
  const cached = localStorage.getItem(key);
  if (cached === 'null') return null;
  if (cached) return cached;

  const enc = s => encodeURIComponent(s);
  const hosts = ['en','de'];
  const candidates = (lang)=> lang==='en'
    ? [`${name} (footballer)`, name, `${name} (soccer)`, `${name} (football player)`]
    : [`${name} (Fußballspieler)`, name];

  for (const h of hosts){
    for (const t of candidates(h)){
      try{
        const url = `https://${h}.wikipedia.org/api/rest_v1/page/summary/${enc(t)}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const js = await res.json();
        if (js.type === 'disambiguation') continue;
        const thumb = js.thumbnail && (js.thumbnail.source || js.thumbnail.url);
        if (thumb){ localStorage.setItem(key, thumb); return thumb; }
      }catch{}
    }
  }
  localStorage.setItem(key, 'null');
  return null;
}

function Avatar({ name }){
  const [url, setUrl] = useState(null);
  useEffect(()=>{
    let dead = false;
    (async ()=>{
      const u = await resolvePlayerImage(name);
      if (!dead) setUrl(u);
    })();
    return ()=>{ dead = true; }
  }, [name]);

  return (
    <div className="avatar" title={name}>
      {url ? <img src={url} alt={name} onError={()=>setUrl(null)} /> : initials(name)}
    </div>
  );
}

/* =========================== App =========================== */

export default function App(){
  const [pw] = useState(localStorage.getItem('tb_pw') || DEFAULT_PW);
  const [loggedIn, setLoggedIn] = useState(false);
  const [msg, setMsg] = useState('');
  const [players, setPlayers] = useState([]);
  const [bids, setBids] = useState([]);
  const [highest, setHighest] = useState({});
  const [debug, setDebug] = useState('');

  const [userName, setUserName] = useState(localStorage.getItem('tb_name') || '');

  function saveName(){
    const n = userName.trim();
    if (!n) { setMsg('Bitte einen Namen eingeben.'); return; }
    localStorage.setItem('tb_name', n);
    setMsg('Name gespeichert.'); setTimeout(()=>setMsg(''), 1200);
  }

  // Auto-Login
  useEffect(()=>{
    (async ()=>{
      setMsg('Versuche Auto-Login …');
      const loginUrl = API + '?path=login&password=' + encodeURIComponent(pw);
      const r = await fetchJSON(loginUrl);
      setDebug(`Login (status ${r.status ?? 'n/a'}): ${r.raw ?? ''}`);
      if (r.ok && r.data && r.data.ok === true){
        localStorage.setItem('tb_pw', pw);
        setLoggedIn(true);
        await loadState(pw);
        setMsg('');
      } else {
        setMsg('Login fehlgeschlagen. PASSWORD in Script-Eigenschaften prüfen & Web-App neu bereitstellen.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadState(currentPw = pw){
    const r = await apiCall('getState', { password: currentPw });
    setDebug(d=>d+`\ngetState (status ${r.status ?? 'n/a'}): ${r.raw ?? ''}`);
    if (r.ok && r.data && r.data.ok){
      setPlayers(r.data.players || []);
      setBids(r.data.bids || []);
      setHighest(r.data.highest || {});
    } else {
      setMsg('Fehler beim Laden: ' + (r.error || (r.data && r.data.error) || ''));
    }
  }

  async function addPlayer(){
    const playerName = prompt('Spielername:');
    const team = prompt('Team:');
    const marketValue = prompt('Marktwert (Startgebot):');
    if (!playerName || !marketValue) return;
    const r = await apiCall('addPlayer', { password: pw, playerName, team: team || '', marketValue, owner: (userName||'').trim() });
    if (r.ok && r.data && r.data.ok){ await loadState(); } else { setMsg('Fehler addPlayer: '+(r.error || (r.data && r.data.error))); }
  }

  async function placeBid(playerId){
    const name = (userName||'').trim();
    if (!name){ setMsg('Bitte oben deinen Namen speichern.'); return; }
    const bidValue = prompt('Dein Gebot (z. B. 5.000.000 oder Text):');
    if (!bidValue) return;
    const r = await apiCall('placeBid', { password: pw, playerId, bidValue, bidderName: name });
    if (r.ok && r.data && r.data.ok){ await loadState(); } else { setMsg('Fehler placeBid: '+(r.error || (r.data && r.data.error))); }
  }

  async function withdrawBid(bidId){
    if (!window.confirm('Gebot wirklich zurückziehen?')) return;
    const r = await apiCall('withdrawBid', { password: pw, bidId });
    if (r.ok && r.data && r.data.ok){ await loadState(); } else { setMsg('Fehler withdrawBid: '+(r.error || (r.data && r.data.error))); }
  }

  async function resetAll(){
    if (!window.confirm('Wirklich ALLES zurücksetzen?')) return;
    const r = await apiCall('resetNow', { password: pw });
    if (r.ok && r.data && r.data.ok){ await loadState(); } else { setMsg('Fehler resetNow: '+(r.error || (r.data && r.data.error))); }
  }

  return (
    <div className="container">
      <div className="header">
        <div className="brand">
          <div className="logo" />
          <div>
            <div className="title">Titanic Bademeister</div>
            <div className="subtle">Gebotsrunde bis Do 23:00 • Reset Fr 15:00</div>
          </div>
        </div>
        <div className="controls">
          <input className="input" value={userName} onChange={e=>setUserName(e.target.value)} placeholder="Dein Name" />
          <button className="btn ghost" onClick={saveName}>Speichern</button>
          <button className="btn secondary" onClick={addPlayer}>Spieler hinzufügen</button>
          <button className="btn secondary" onClick={()=>loadState()}>Aktualisieren</button>
          <button className="btn" onClick={resetAll}>Reset</button>
        </div>
      </div>

      {msg && <div className={`msg ${/fehler|fehl|error/i.test(msg) ? 'error':'ok'}`}>{msg}</div>}

      {!loggedIn && (
        <div className="section">
          <h2>Status</h2>
          <div className="subtle">Auto-Login nutzen (Passwort „Sieger“). Wenn es nicht klappt, PASSWORD/Deploy prüfen.</div>
          <textarea readOnly value={debug} style={{width:'100%',height:120, marginTop:8, background:'var(--panel-2)', color:'var(--text)', border:'1px solid var(--border)', borderRadius:8, padding:10}} />
        </div>
      )}

      {loggedIn && (
        <>
          <div className="section">
            <h2>Angebotene Spieler</h2>
            {!players.length && <div className="subtle">Noch keine Spieler eingestellt.</div>}
            <div className="grid">
              {players.map(p=>{
                const hi = highest[p.id];
                return (
                  <div className="card" key={p.id}>
                    <Avatar name={p.playerName} />
                    <div className="meta">
                      <div className="name">{p.playerName}</div>
                      <div className="team">{p.team || '—'}</div>
                      <div className="row">
                        <span className="badge">Start: <b>{p.marketValue}</b></span>
                        <span className="badge">Owner: <b>{p.owner || '—'}</b></span>
                      </div>
                      <div className="row">
                        <span>Aktuell: <b className="highlight">{hi ? `${hi.bidValue} von ${hi.bidderName || '—'}` : '—'}</b></span>
                      </div>
                    </div>
                    <div>
                      <button className="btn" onClick={()=>placeBid(p.id)}>Bieten</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="section">
            <h2>Alle Gebote</h2>
            <div className="list">
              {bids.length === 0 && <div className="subtle" style={{padding:'8px 4px'}}>Noch keine Gebote.</div>}
              {bids.map(b=>(
                <div className="row" key={b.id}>
                  <div>
                    <b>{b.bidderName || '—'}</b> → {b.bidValue}
                    <span className="small"> &nbsp; (Spieler {b.playerId})</span>
                    <div className="small">{b.timestamp}</div>
                  </div>
                  <button className="btn secondary" onClick={()=>withdrawBid(b.id)}>Zurückziehen</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
