import React, { useState, useEffect } from 'react';
import './styles.css';

const API = 'https://script.google.com/macros/s/AKfycbwNztV3o25lGbDdCX8ziUI6ruJPuY6XcPcfJPHV3qiKMGyjf5q4RkGlOzbxt4xsYGQD/exec';

export default function App() {
  const [pw, setPw] = useState(localStorage.getItem('tb_pw') || '');
  const [loggedIn, setLoggedIn] = useState(false);
  const [msg, setMsg] = useState('');
  const [players, setPlayers] = useState([]);
  const [bids, setBids] = useState([]);
  const [highest, setHighest] = useState({});

  // ---- Login ----
  async function doLogin() {
    setMsg('Prüfe Login…');
    if (!pw) { 
      setMsg('Bitte Passwort eingeben.'); 
      return; 
    }

    // 👉 Login per GET mit Query-Param (kein Preflight/CORS)
    const url = API + '?path=login&password=' + encodeURIComponent(pw);

    try {
      const res = await fetch(url);
      const txt = await res.text();
      const r = JSON.parse(txt);

      if (r && r.ok) {
        localStorage.setItem('tb_pw', pw);
        setLoggedIn(true);
        setMsg('');
      } else {
        setMsg('Login fehlgeschlagen. Stimmt das Passwort?');
      }
    } catch (e) {
      setMsg('Netzwerkfehler beim Login: ' + String(e));
    }
  }

  // ---- API Call Helper ----
  async function apiCall(path, method = 'GET', body) {
    const url = API + '?path=' + encodeURIComponent(path);
    const options = { method };

    if (body) {
      const form = new URLSearchParams(body).toString();
      options.body = form;
      options.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      options.method = 'POST';
    }

    try {
      const res = await fetch(url, options);
      const txt = await res.text();
      return JSON.parse(txt);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  // ---- Daten laden ----
  async function loadState() {
    setMsg('Lade aktuelle Daten…');
    const data = await apiCall('getState', 'POST', { password: pw });
    if (data.ok) {
      setPlayers(data.players || []);
      setBids(data.bids || []);
      setHighest(data.highest || {});
      setMsg('');
    } else {
      setMsg('Fehler beim Laden: ' + (data.error || 'unbekannt'));
    }
  }

  useEffect(() => {
    if (loggedIn) loadState();
  }, [loggedIn]);

  // ---- Spieler hinzufügen ----
  async function addPlayer() {
    const playerName = prompt('Spielername:');
    const team = prompt('Teamname:');
    const marketValue = prompt('Marktwert:');
    if (!playerName || !team || !marketValue) return;

    const res = await apiCall('addPlayer', 'POST', { password: pw, playerName, team, marketValue });
    if (res.ok) {
      alert('Spieler hinzugefügt!');
      loadState();
    } else {
      alert('Fehler: ' + res.error);
    }
  }

  // ---- Gebot abgeben ----
  async function placeBid(id) {
    const bidValue = prompt('Gebot für diesen Spieler:');
    if (!bidValue) return;
    const res = await apiCall('placeBid', 'POST', { password: pw, playerId: id, bidValue });
    if (res.ok) {
      alert('Gebot erfolgreich!');
      loadState();
    } else {
      alert('Fehler: ' + res.error);
    }
  }

  // ---- Reset ----
  async function resetAll() {
    if (!window.confirm('Wirklich alles löschen?')) return;
    const res = await apiCall('resetNow', 'POST', { password: pw });
    if (res.ok) {
      alert('Alles zurückgesetzt!');
      loadState();
    } else {
      alert('Fehler beim Reset: ' + res.error);
    }
  }

  // ---- UI ----
  if (!loggedIn) {
    return (
      <div className="login-container">
        <h1>Titanic Bademeister — Login</h1>
        <input
          value={pw}
          onChange={e => setPw(e.target.value)}
          placeholder="Passwort"
        />
        <button onClick={doLogin}>Einloggen</button>
        {msg && <p className="msg">{msg}</p>}
        <p>Benutze das Passwort, das du bekommen hast.</p>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>Titanic Bademeister</h1>
      <button onClick={addPlayer}>Spieler hinzufügen</button>
      <button onClick={resetAll}>Reset</button>
      <button onClick={loadState}>Aktualisieren</button>

      {msg && <p className="msg">{msg}</p>}

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
              <td>{highest[p.id]?.bidValue || '-'}</td>
              <td>
                <button onClick={() => placeBid(p.id)}>Bieten</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
