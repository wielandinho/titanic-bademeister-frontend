import React, { useEffect, useState } from 'react';
import './styles.css';

// ❗ DEINE Backend-URL (Apps Script Web-App URL) – exakt so eintragen:
const API = 'https://script.google.com/macros/s/AKfycbwNztV3o25lGbDdCX8ziUI6ruJPuY6XcPcfJPHV3qiKMGyjf5q4RkGlOzbxt4xsYGQD/exec';

// Standard-Passwort für Auto-Login
const DEFAULT_PW = 'Sieger';

// ---- Hilfsfunktion: einfache Fetch+JSON mit Fehleranzeige ----
async function fetchJSON(url, options) {
  try {
    const res = await fetch(url, options);
    const txt = await res.text();
    try {
      return { ok: true, data: JSON.parse(txt), raw: txt, status: res.status };
    } catch {
      return { ok: false, error: 'invalid_json', raw: txt, status: res.status };
    }
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ---- Form-POST (ohne Preflight) ----
async function apiCall(path, body) {
  const url = API + '?path=' + encodeURIComponent(path);
  if (body) {
    const form = new URLSearchParams(body).toString();
    return fetchJSON(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form
    });
  }
  // GET
  return fetchJSON(url);
}

export default function App() {
  const [pw, setPw] = useState(localStorage.getItem('tb_pw') || DEFAULT_PW);
  const [loggedIn, setLoggedIn] = useState(false);
  const [players, setPlayers] = useState([]);
  const [bids, setBids] = useState([]);
  const [highest, setHighest] = useState({});
  const [msg, setMsg] = useState('');
  const [debug, setDebug] = useState('');

  // ---- AUTO-LOGIN direkt beim Start ----
  useEffect(() => {
    (async () => {
      setMsg('Versuche Auto-Login …');
      // Login als GET (keine Preflight/CORS-Probleme)
      const loginUrl = API + '?path=login&password=' + encodeURIComponent(pw);
      const r = await fetchJSON(loginUrl);
      setDebug(`Login Response (status ${r.status ?? 'n/a'}): ${r.raw ?? JSON.stringify(r)}`);
      if (r.ok && r.data && r.data.ok === true) {
        localStorage.setItem('tb_pw', pw);
        setLoggedIn(true);
        setMsg('Eingeloggt. Lade Daten …');
        await loadState(pw);
      } else {
        setMsg('Login fehlgeschlagen. Prüfe PASSWORD Script-Property und URL.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- State laden ----
  async function loadState(currentPw = pw) {
    const r = await apiCall('getState', { password: currentPw });
    setDebug(d => d + `\ngetState Response (status ${r.status ?? 'n/a'}): ${r.raw ?? JSON.stringify(r)}`);
    if (r.ok && r.data && r.data.ok) {
      setPlayers(r.data.players || []);
      setBids(r.data.bids || []);
      setHighest(r.data.highest || {});
      setMsg('');
    } else {
      setMsg('Fehler beim Laden: ' + (r.error || (r.data && r.data.error) || 'unbekannt'));
    }
  }

  // ---- Spieler hinzufügen ----
  async function addPlayer() {
    const playerName = prompt('Spielername:');
    const team = prompt('Team:');
    const marketValue = prompt('Marktwert (Startgebot):');
    if (!playerName || !marketValue) return;

    const r = await apiCall('addPlayer', { password: pw, playerName, team: team || '', marketValue });
    setDebug(d => d + `\naddPlayer Response (status ${r.status ?? 'n/a'}): ${r.raw ?? JSON.stringify(r)}`);
    if (r.ok && r.data && r.data.ok) {
      alert('Spieler hinzugefügt.');
      loadState();
    } else {
      alert('Fehler addPlayer: ' + (r.error || (r.data && r.data.error)));
    }
  }

  // ---- Gebot abgeben ----
  async function placeBid(playerId) {
    const bidValue = prompt('Dein Gebot (z. B. 5.000.000):');
    if (!bidValue) return;
    const r = await apiCall('placeBid', { password: pw, playerId, bidValue });
    setDebug(d => d + `\nplaceBid Response (status ${r.status ?? 'n/a'}): ${r.raw ?? JSON.stringify(r)}`);
    if (r.ok && r.data && r.data.ok) {
      loadState();
    } else {
      alert('Fehler placeBid: ' + (r.error || (r.data && r.data.error)));
    }
  }

  // ---- Gebot zurückziehen ----
  async function withdrawBid(bidId) {
    if (!window.confirm('Gebot wirklich zurückziehen?')) return;
    const r = await apiCall('withdrawBid', { password: pw, bidId });
    setDebug(d => d + `\nwithdrawBid Response (status ${r.status ?? 'n/a'}): ${r.raw ?? JSON.stringify(r)}`);
    if (r.ok && r.data && r.data.ok) {
      loadState();
    } else {
      alert('Fehler withdrawBid: ' + (r.error || (r.data && r.data.error)));
    }
  }

  // ---- Manuelles Reset (Admin) ----
  async function resetAll() {
    if (!window.confirm('Wirklich ALLES zurücksetzen?')) return;
    const r = await apiCall('resetNow', { password: pw });
    setDebug(d => d + `\nresetNow Response (status ${r.status ?? 'n/a'}): ${r.raw ?? JSON.stringify(r)}`);
    if (r.ok && r.data && r.data.ok) {
      alert('Zurückgesetzt.');
      loadState();
    } else {
      alert('Fehler resetNow: ' + (r.error || (r.data && r.data.error)));
    }
  }

  return (
    <div className="app" style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ fontSize: 12, opacity: 0.6, textAlign: 'right' }}>
        API: {API}
      </div>

      <h1>Titanic Bademeister</h1>

      {!loggedIn && (
        <>
          <p style={{ color: 'crimson' }}>{msg}</p>
          <p><b>Hinweis:</b> Auto-Login versucht Passwort „Sieger“. Wenn das nicht klappt, stimmt vermutlich
            die <i>Script-Eigenschaft</i> <code>PASSWORD</code> oder die Web-App-URL nicht (Apps Script neu bereitstellen!).</p>
          <textarea readOnly value={debug} style={{width:'100%',height:140}} />
        </>
      )}

      {loggedIn && (
        <>
          <div style={{ marginBottom: 12 }}>
            <button onClick={addPlayer}>Spieler hinzufügen</button>{' '}
            <button onClick={resetAll}>Reset</button>{' '}
            <button onClick={() => loadState()}>Aktualisieren</button>
          </div>

          {msg && <p style={{ color: 'crimson' }}>{msg}</p>}

          <h2>Spieler</h2>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Team</th>
                <th>Marktwert</th>
                <th>Höchstes Gebot</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {players.map(p => (
                <tr key={p.id}>
                  <td>{p.playerName}</td>
                  <td>{p.team}</td>
                  <td>{p.marketValue}</td>
                  <td>{highest[p.id]?.bidValue ? `${highest[p.id].bidValue} von ${highest[p.id].bidderName}` : '-'}</td>
                  <td><button onClick={() => placeBid(p.id)}>Bieten</button></td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Alle Gebote</h2>
          <div style={{maxHeight: 240, overflow:'auto', border:'1px solid #eee', padding:8}}>
            {bids.map(b => (
              <div key={b.id} style={{borderBottom:'1px solid #f0f0f0', padding:'4px 0'}}>
                <div>{b.bidderName} → {b.bidValue} (Spieler {b.playerId})</div>
                <div style={{fontSize:12, opacity:0.6}}>{b.timestamp}</div>
                <button onClick={() => withdrawBid(b.id)}>Zurückziehen</button>
              </div>
            ))}
          </div>

          <h3>Debug</h3>
          <textarea readOnly value={debug} style={{width:'100%',height:140}} />
        </>
      )}
    </div>
  );
}
