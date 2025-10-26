import React, { useEffect, useState, useMemo } from 'react';
import './styles.css';

// ❗ Deine Apps Script Web-App URL:
const API = 'https://script.google.com/macros/s/AKfycbwNztV3o25lGbDdCX8ziUI6ruJPuY6XcPcfJPHV3qiKMGyjf5q4RkGlOzbxt4xsYGQD/exec';
const DEFAULT_PW = 'Sieger';

/* ----------------------------- Utils ----------------------------- */

// Fetch mit JSON-Parsing + robustem Fehlerhandling
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

// Form-POST (vermeidet Preflight/CORS)
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
  return fetchJSON(url);
}

// Initialen aus einem Namen (Fallback-Avatar)
function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '🧑';
  const first = parts[0][0] || '';
  const last  = parts.length > 1 ? parts[parts.length-1][0] : '';
  return (first + last).toUpperCase();
}

/* -------------------- Wikipedia Bild-Suche + Cache -------------------- */
/**
 * Holt ein Spielerbild von Wikipedia (en/de), cached in localStorage.
 * Strategie:
 *  1) en: "Name (footballer)" → "Name" → "Name (soccer)"
 *  2) de: "Name (Fußballspieler)" → "Name"
 * Ignoriert Disambiguation-Seiten. Größe ~320px.
 */
async function resolvePlayerImage(name) {
  if (!name) return null;

  const cacheKey = 'tb_img_' + name.toLowerCase();
  const cached = localStorage.getItem(cacheKey);
  if (cached === 'null') return null;
  if (cached) return cached;

  const enc = s => encodeURIComponent(s);
  const hosts = ['en', 'de'];
  const candidatesByHost = {
    en: [ `${name} (footballer)`, name, `${name} (soccer)`, `${name} (football player)` ],
    de: [ `${name} (Fußballspieler)`, name ]
  };

  for (const h of hosts) {
    const candidates = candidatesByHost[h] || [name];
    for (const title of candidates) {
      try {
        const url = `https://${h}.wikipedia.org/api/rest_v1/page/summary/${enc(title)}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const js = await res.json();
        if (js.type === 'disambiguation') continue;
        const thumb = js.thumbnail && (js.thumbnail.source || js.thumbnail.url);
        if (thumb) {
          localStorage.setItem(cacheKey, thumb);
          return thumb;
        }
      } catch (e) {
        // ignore and try next
      }
    }
  }
  localStorage.setItem(cacheKey, 'null');
  return null;
}

/* ------------------------- Avatar Komponente ------------------------- */

function PlayerAvatar({ name }) {
  const [url, setUrl] = useState(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const img = await resolvePlayerImage(name);
      if (!cancelled) { setUrl(img); setTried(true); }
    })();
    return () => { cancelled = true; };
  }, [name]);

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={{
          width: 64, height: 64, borderRadius: '50%',
          objectFit: 'cover', background: '#eee', flexShrink: 0
        }}
        onError={() => setUrl(null)}
      />
    );
  }

  // Fallback auf Initialen (oder während Ladezeit)
  return (
    <div
      style={{
        width: 64, height: 64, borderRadius: '50%', background: '#eef2ff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700
      }}
      title={tried ? 'Kein Bild gefunden – Initialen' : 'Lade Bild …'}
    >
      {initials(name)}
    </div>
  );
}

/* ------------------------------ App ------------------------------ */

export default function App() {
  const [pw, setPw] = useState(localStorage.getItem('tb_pw') || DEFAULT_PW);
  const [loggedIn, setLoggedIn] = useState(false);
  const [msg, setMsg] = useState('');
  const [players, setPlayers] = useState([]);
  const [bids, setBids] = useState([]);
  const [highest, setHighest] = useState({});
  const [debug, setDebug] = useState('');

  // Persistenter Anzeigename fürs Bieten
  const [userName, setUserName] = useState(localStorage.getItem('tb_name') || '');
  function saveName() {
    const n = userName.trim();
    if (!n) { alert('Bitte einen Namen eingeben.'); return; }
    localStorage.setItem('tb_name', n);
    alert('Name gespeichert.');
  }

  // Auto-Login direkt beim Mount
  useEffect(() => {
    (async () => {
      setMsg('Versuche Auto-Login …');
      const loginUrl = API + '?path=login&password=' + encodeURIComponent(pw);
      const r = await fetchJSON(loginUrl);
      setDebug(`Login Response (status ${r.status ?? 'n/a'}): ${r.raw ?? JSON.stringify(r)}`);
      if (r.ok && r.data && r.data.ok === true) {
        localStorage.setItem('tb_pw', pw);
        setLoggedIn(true);
        setMsg('Eingeloggt. Lade Daten …');
        await loadState(pw);
        setMsg('');
      } else {
        setMsg('Login fehlgeschlagen. Prüfe PASSWORD in den Script-Eigenschaften oder die Web-App URL (neu bereitstellen).');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // State laden
  async function loadState(currentPw = pw) {
    const r = await apiCall('getState', { password: currentPw });
    setDebug(d => d + `\ngetState Response (status ${r.status ?? 'n/a'}): ${r.raw ?? JSON.stringify(r)}`);
    if (r.ok && r.data && r.data.ok) {
      setPlayers(r.data.players || []);
      setBids(r.data.bids || []);
      setHighest(r.data.highest || {});
    } else {
      setMsg('Fehler beim Laden: ' + (r.error || (r.data && r.data.error) || 'unbekannt'));
    }
  }

  // Spieler hinzufügen (Owner = userName)
  async function addPlayer() {
    const playerName = prompt('Spielername:');
    const team = prompt('Team:');
    const marketValue = prompt('Marktwert (Startgebot):');
    if (!playerName || !marketValue) return;

    const r = await apiCall('addPlayer', {
      password: pw,
      playerName,
      team: team || '',
      marketValue,
      owner: (userName || '').trim()
    });
    setDebug(d => d + `\naddPlayer Response (status ${r.status ?? 'n/a'}): ${r.raw ?? JSON.stringify(r)}`);
    if (r.ok && r.data && r.data.ok) {
      alert('Spieler hinzugefügt.');
      loadState();
    } else {
      alert('Fehler addPlayer: ' + (r.error || (r.data && r.data.error)));
    }
  }

  // Gebot abgeben (benutzt userName)
  async function placeBid(playerId) {
    const name = (userName || '').trim();
    if (!name) { alert('Bitte oben deinen Namen speichern.'); return; }
    const bidValue = prompt('Dein Gebot (z. B. 5.000.000 oder Text):');
    if (!bidValue) return;

    const r = await apiCall('placeBid', {
      password: pw,
      playerId,
      bidValue,
      bidderName: name
    });
    setDebug(d => d + `\nplaceBid Response (status ${r.status ?? 'n/a'}): ${r.raw ?? JSON.stringify(r)}`);
    if (r.ok && r.data && r.data.ok) {
      loadState();
    } else {
      alert('Fehler placeBid: ' + (r.error || (r.data && r.data.error)));
    }
  }

  // Gebot zurückziehen
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

  // Admin: Reset sofort
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

  /* ----------------------------- UI ----------------------------- */

  return (
    <div className="app" style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ fontSize: 12, opacity: 0.6, textAlign: 'right' }}>
        API: {API}
      </div>

      <h1 style={{ marginBottom: 8 }}>Titanic Bademeister</h1>
      <div style={{ opacity: 0.7, marginBottom: 16 }}>Gebotsrunde: jede Woche bis Donnerstag, 23:00 Uhr • Reset: Freitag 15:00</div>

      {/* Login/Debug */}
      {!loggedIn && (
        <>
          <p style={{ color: 'crimson' }}>{msg}</p>
          <textarea readOnly value={debug} style={{ width: '100%', height: 120 }} />
        </>
      )}

      {loggedIn && (
        <>
          {/* Nutzername */}
          <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label><b>Dein Name:</b></label>
            <input
              value={userName}
              onChange={e => setUserName(e.target.value)}
              placeholder="z. B. Jonas"
              style={{ padding: '6px 8px' }}
            />
            <button onClick={saveName}>Speichern</button>

            <div style={{ marginLeft: 'auto' }}>
              <button onClick={addPlayer}>Spieler hinzufügen</button>{' '}
              <button onClick={resetAll}>Reset</button>{' '}
              <button onClick={() => loadState()}>Aktualisieren</button>
            </div>
          </div>

          {/* Spieler-Kacheln */}
          <h2 style={{ marginTop: 8 }}>Angebotene Spieler</h2>
          {!players.length && <div style={{ opacity: 0.6, marginBottom: 12 }}>Noch keine Spieler eingestellt.</div>}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12
          }}>
            {players.map(p => {
              const hi = highest[p.id];
              return (
                <div key={p.id} style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: 12,
                  background: 'white',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center'
                }}>
                  <PlayerAvatar name={p.playerName} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.playerName}</div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{p.team || '—'}</div>
                    <div style={{ marginTop: 6 }}>Marktwert / Start: <b>{p.marketValue}</b></div>
                    <div style={{ marginTop: 4, fontSize: 14 }}>
                      Aktuell höchstes Gebot: <b>{hi ? `${hi.bidValue} von ${hi.bidderName || '—'}` : '—'}</b>
                    </div>
                  </div>
                  <div>
                    <button onClick={() => placeBid(p.id)}>Bieten</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Alle Gebote */}
          <h2 style={{ marginTop: 24 }}>Alle Gebote</h2>
          <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid #eee', borderRadius: 8, padding: 8, background: '#fff' }}>
            {bids.length === 0 && <div style={{ opacity: 0.6 }}>Noch keine Gebote.</div>}
            {bids.map(b => (
              <div key={b.id} style={{ borderBottom: '1px solid #f0f0f0', padding: '6px 0' }}>
                <div><b>{b.bidderName || '—'}</b> → {b.bidValue} <span style={{ opacity: 0.6 }}> (Spieler {b.playerId})</span></div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{b.timestamp}</div>
                <button onClick={() => withdrawBid(b.id)}>Zurückziehen</button>
              </div>
            ))}
          </div>

          {/* Debug */}
          <h3>Debug</h3>
          <textarea readOnly value={debug} style={{ width: '100%', height: 120 }} />
        </>
      )}
    </div>
  );
}
