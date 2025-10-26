import React, {useEffect, useState} from 'react';
const API = import.meta.env.VITE_API_URL || '';
function apiCall(path, method='GET', body){
  const url = API + '?path=' + encodeURIComponent(path);
  const options = { method };
  if (body) { options.body = JSON.stringify(body); options.headers = { 'Content-Type':'application/json' }; }
  return fetch(url, options).then(r=>r.json());
}
export default function App(){
  const [loggedIn,setLoggedIn] = useState(false);
  const [pw,setPw] = useState('');
  const [state,setState] = useState({players:[],bids:[],highest:{}});
  const [form, setForm] = useState({playerName:'',team:'',marketValue:''});
  useEffect(()=>{ const t=setInterval(()=>refresh(),4000); refresh(); return ()=>clearInterval(t); },[]);
  function refresh(){ if(!API) return; apiCall('getState').then(r=>{ if(r.ok) setState(r); }); }
  function doLogin(){ apiCall('login','POST',{password:pw}).then(r=>{ if(r.ok){ setLoggedIn(true); localStorage.setItem('tb_pw', pw);} else alert('wrong password'); }); }
  useEffect(()=>{ const p = localStorage.getItem('tb_pw'); if(p){ setPw(p); apiCall('login','POST',{password:p}).then(r=>{ if(r.ok) setLoggedIn(true); }); } },[]);
  function addPlayer(){ const payload = {...form, password: localStorage.getItem('tb_pw')}; apiCall('addPlayer','POST',payload).then(r=>{ if(r.ok){ setForm({playerName:'',team:'',marketValue:''}); refresh(); } else alert(JSON.stringify(r)); }) }
  function placeBid(pid){ const bidderName = prompt('Dein Name?'); const bidValue = prompt('Gebotswert (z. B. Coins oder Spielernamen als Text)'); if (!bidValue) return; const payload = { playerId: pid, bidderName, bidValue, password: localStorage.getItem('tb_pw') }; apiCall('placeBid','POST',payload).then(r=>{ if (r.ok) refresh(); else alert(JSON.stringify(r)); }) }
  function withdrawBid(bidId){ if (!confirm('Bid zurückziehen?')) return; apiCall('withdrawBid','POST',{bidId, password: localStorage.getItem('tb_pw')}).then(r=>{ if (r.ok) refresh(); else alert(JSON.stringify(r)); }) }
  if (!loggedIn) return (<div style={{padding:20}}><h2>Titanic Bademeister — Login</h2><input value={pw} onChange={e=>setPw(e.target.value)} placeholder='Passwort'/> <button onClick={doLogin}>Einloggen</button><p>Benutze das Passwort, das du bekommen hast.</p></div>);
  return (
    <div style={{padding:20, maxWidth:900, margin:'0 auto'}}>
      <h1>Titanic Bademeister — Kickbase Auktionen</h1>
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
              <div style={{marginTop:8}}>Aktuell höchstes Gebot: {highest ? highest.bidValue + ' von ' + highest.bidderName : 'keine Gebote'}</div>
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
