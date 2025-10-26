import React, {useEffect, useState} from 'react';

// ✅ HART VERDRAHTET (zum Testen; wenn alles läuft, können wir wieder auf Env wechseln)
const API = 'https://script.google.com/macros/s/AKfycbw80hHCsxa8dJKyrTPg7Ft2UlVvr-XCfFADRSqzEfrBuIzf9Mjpbe2D_bXWOniP1l8l/exec';

function apiCall(path, method='GET', body){
  const url = API + '?path=' + encodeURIComponent(path);
  const options = { method };
  if (body) {
    options.body = JSON.stringify(body);
    options.headers = { 'Content-Type':'application/json' };
  }
  return fetch(url, options).then(async r => {
    const txt = await r.text();
    try { return JSON.parse(txt); } catch(e) { return {ok:false, error:'invalid_json', raw:txt}; }
  }).catch(err => ({ok:false, error:String(err)}));
}

export default function App(){
  const [loggedIn,setLoggedIn] = useState(false);
  const [pw,setPw] = useState('');
  const [state,setState] = useState({players:[],bids:[],highest:{}});
  const [form, setForm] = useState({playerName:'',team:'',marketValue:''});
  const [msg,setMsg] = useState('');

  useEffect(()=>{
    // Polling nur wenn eingeloggt
    if (!loggedIn) return;
    const t = setInterval(()=>refresh(), 4000);
    refresh();
    return ()=>clearInterval(t);
  }, [loggedIn]);

  function refresh(){
    apiCall('getState','POST',{password: localStorage.getItem('tb_pw')})
      .then(r=>{
        if (r.ok) { setState(r); setMsg(''); }
        else setMsg('Fehler getState: ' + JSON.stringify(r));
      });
  }

  async function doLogin(){
    setMsg('Prüfe Login…');
    if (!pw) { setMsg('Bitte Passwort eingeben.'); return; }
    const r = await apiCall('login','POST',{password: pw});
    if (r && r.ok){
      localStorage.setItem('tb_pw', pw);
      setLoggedIn(true);
      setMsg('');
    } else {
      setMsg('Login fehlgeschlagen. Stimmt das Passwort?');
    }
  }

  function addPlayer(){
    const payload = {...form, password: localStorage.getItem('tb_pw')};
    if (!payload.playerName || !payload.marketValue){ setMsg('Bitte Spielername und Marktwert angeben.'); return; }
    apiCall('addPlayer','POST',payload).then(r=>{
      if (r.ok){ setForm({playerName:'',team:'',marketValue:''}); refresh(); }
      else setMsg('Fehler addPlayer: ' + JSON.stringify(r));
    });
  }

  function placeBid(pid){
    const bidderName = prompt('Dein Name?');
    const bidValue = prompt('Gebotswert (z. B. 5 Mio oder Spielername)');
    if (!bidderName || !bidValue) return;
    const payload = { playerId: pid, bidderName, bidValue, password: localStorage.getItem('tb_pw') };
    apiCall('placeBid','POST',payload).then(r=>{
      if (r.ok) { refresh(); }
      else setMsg('Fehler placeBid: ' + JSON.stringify(r));
    });
  }

  function withdrawBid(bidId){
    if (!confirm('Gebot wirklich zurückziehen?')) return;
    apiCall('withdrawBid','POST',{bidId, password: localStorage.getItem('tb_pw')})
      .then(r=>{
        if (r.ok) refresh();
        else setMsg('Fehler withdrawBid: ' + JSON.stringify(r));
      });
  }

  // Login-Ansicht
  if (!loggedIn) return (
    <div style={{padding:20, maxWidth:900, margin:'0 auto'}}>
      <div style={{fontSize:12, opacity:0.6, textAlign:'right'}}>API: {API}</div>
      <h2>Titanic Bademeister — Login</h2>
      <input value={pw} onChange={e=>setPw(e.target.value)} placeholder='Passwort' />
      <button onClick={doLogin} style={{marginLeft:8}}>Einloggen</button>
      <p>Benutze das Passwort, das du bekommen hast.</p>
      {msg && <p style={{color:'crimson'}}>{msg}</p>}
    </div>
  );

  // Haupt-UI
  return (
    <div style={{padding:20, maxWidth:900, margin:'0 auto'}}>
      <div style={{fontSize:12, opacity:0.6, textAlign:'right'}}>API: {API}</div>
      <h1>Titanic Bademeister — Kickbase Auktionen</h1>

      {msg && <p style={{color:'crimson'}}>{msg}</p>}

      <section style={{marginTop:20}}>
        <h3>Spieler einstellen</h3>
        <input placeholder='Spielername' value={form.playerName} onChange={e=>setForm({...form, playerName:e.target.value})} />{' '}
        <input placeholder='Team' value={form.team} onChange={e=>setForm({...form, team:e.target.value})} />{' '}
        <input placeholder='Marktwert (Startgebot)' value={form.marketValue} onChange={e=>setForm({...form, marketValue:e.target.value})} />{' '}
        <button onClick={addPlayer}>Spieler einstellen</button>
      </section>

      <section style={{marginTop:30}}>
        <h3>Aktuelle Angebote</h3>
        {state.players.map(p=>{
          const highest = state.highest[p.id];
          return (
            <div key={p.id} style={{border:'1px solid #ddd', padding:10, marginBottom:10}}>
              <div style={{fontWeight:700}}>{p.playerName} — {p.team}</div>
              <div>Marktwert / Start: {p.marketValue}</div>
              <div style={{marginTop:8}}><button onClick={()=>placeBid(p.id)}>Bieten</button></div>
              <div style={{marginTop:8}}>Aktuell höchstes Gebot: {highest ? `${highest.bidValue} von ${highest.bidderName}` : 'keine Gebote'}</div>
            </div>
          );
        })}
      </section>

      <section style={{marginTop:30}}>
        <h3>Alle Gebote (Chronologisch)</h3>
        {state.bids.map(b=> (
          <div key={b.id} style={{borderBottom:'1px solid #eee', padding:6}}>
            <div>{b.bidderName} → {b.bidValue} (für Spieler {b.playerId})</div>
            <div style={{fontSize:12, opacity:0.6}}>{b.timestamp}</div>
            <div><button onClick={()=>withdrawBid(b.id)}>Zurückziehen</button></div>
          </div>
        ))}
      </section>
    </div>
  );
}
