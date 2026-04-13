/**
 * JOGO DA VELHA — FUNCIONAL E COMPLETO
 * IndexedDB puro + Supabase backup manual
 *
 * CONFIGURAÇÃO: edite js/config.js (NÃO commitado no Git)
 */
const SUPA_OK = typeof SUPABASE_URL !== 'undefined' && !SUPABASE_URL.includes('SEU_PROJETO');

/* ────────────── IndexedDB ────────────── */
const DB = (() => {
  let db;
  const DB_NAME = 'jogo_velha_final';

  function open() {
    return new Promise((ok, no) => {
      if (db) return ok(db);
      const r = indexedDB.open(DB_NAME, 2);
      r.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('series')) {
          const s = d.createObjectStore('series', { keyPath: 'id', autoIncrement: true });
          s.createIndex('synced', 'synced');
        }
        if (!d.objectStoreNames.contains('players')) d.createObjectStore('players', { keyPath: 'name' });
      };
      r.onsuccess = () => { db = r.result; ok(db); };
      r.onerror = () => no(r.error);
    });
  }

  async function put(store, data) {
    await open();
    return new Promise((ok, no) => {
      const t = db.transaction(store, 'readwrite');
      t.objectStore(store).put(data);
      t.oncomplete = () => ok();
      t.onerror = () => no(t.error);
    });
  }

  async function add(store, data) {
    await open();
    return new Promise((ok, no) => {
      const t = db.transaction(store, 'readwrite');
      const r = t.objectStore(store).add(data);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    });
  }

  async function getAll(store) {
    await open();
    return new Promise((ok, no) => {
      const t = db.transaction(store, 'readonly');
      const r = t.objectStore(store).getAll();
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    });
  }

  async function addSeries(px, po, sx, so, dr, rnd, win) {
    try {
      const id = await add('series', { player_x: px, player_o: po, score_x: sx, score_o: so, draws: dr, rounds: rnd, winner: win, synced: false, created: new Date().toISOString() });

      // Atualiza jogador X
      let playerX = await _get(px);
      if (!playerX) playerX = { name: px, won: 0, lost: 0, drawn: 0 };
      if (win === 'Empate') playerX.drawn++;
      else if (win === px) playerX.won++;
      else playerX.lost++;
      await put('players', playerX);

      // Atualiza jogador O
      let playerO = await _get(po);
      if (!playerO) playerO = { name: po, won: 0, lost: 0, drawn: 0 };
      if (win === 'Empate') playerO.drawn++;
      else if (win === po) playerO.won++;
      else playerO.lost++;
      await put('players', playerO);

      return id;
    } catch(e) { console.error('[DB] Erro ao salvar série:', e); }
  }

  function _get(name) {
    return new Promise((ok, no) => {
      open().then(() => {
        const t = db.transaction('players', 'readonly');
        const r = t.objectStore('players').get(name);
        r.onsuccess = () => ok(r.result || null);
        r.onerror = () => no(r.error);
      });
    });
  }

  async function markSynced(id) {
    await open();
    return new Promise(ok => {
      const t = db.transaction('series', 'readwrite');
      const s = t.objectStore('series');
      const r = s.get(id);
      r.onsuccess = () => { if (r.result) { r.result.synced = true; s.put(r.result); } };
      t.oncomplete = () => ok();
    });
  }

  async function getPending() {
    await open();
    return new Promise(ok => {
      const t = db.transaction('series', 'readonly');
      const store = t.objectStore('series');
      const all = store.getAll();
      all.onsuccess = () => {
        const pending = all.result.filter(s => s.synced === false);
        ok(pending);
      };
      all.onerror = () => ok([]);
    });
  }

  async function getSeries() {
    const arr = await getAll('series');
    return arr.reverse();
  }

  async function getTopWinners() {
    const arr = await getAll('players');
    return arr.filter(p => p.won > 0).sort((a, b) => b.won - a.won).slice(0, 10);
  }

  async function clear() {
    await open();
    await new Promise(ok => { db.transaction('series', 'readwrite').objectStore('series').clear().onsuccess = ok; });
    await new Promise(ok => { db.transaction('players', 'readwrite').objectStore('players').clear().onsuccess = ok; });
  }

  return { addSeries, markSynced, getPending, getSeries, getTopWinners, clear };
})();

/* ────────────── Supabase Backup ────────────── */
const Supa = (() => {
  const hdr = () => ({ 'Content-Type':'application/json', apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, Prefer:'return=representation' });

  async function backup() {
    const el = $('backup-status');
    if (!SUPA_OK) return setStatus('⚠ Configure SUPABASE', 'error');
    if (!navigator.onLine) return setStatus('⚠ Sem internet', 'error');

    const pending = await DB.getPending();
    if (!pending.length) return setStatus('✓ Tudo sincronizado', 'success');

    $('backup-btn').disabled = true;
    $('backup-btn').textContent = '⟳...';
    setStatus(`⟳ ${pending.length} série(s)...`, 'syncing');

    let ok = 0, err = 0;
    for (const s of pending) {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/series`, {
          method:'POST', headers:hdr(),
          body:JSON.stringify({ player_x:s.player_x, player_o:s.player_o, score_x:s.score_x, score_o:s.score_o, draws:s.draws, rounds_played:s.rounds, winner:s.winner, created_at:s.created })
        });
        if (res.ok) { await DB.markSynced(s.id); ok++; } else err++;
      } catch(e) { err++; }
    }

    $('backup-btn').disabled = false;
    $('backup-btn').textContent = '☁ Backup Cloud';
    setStatus(err===0 ? `✓ ${ok} enviada(s)!` : `⚠ ${ok} ok, ${err} falha(s)`, err===0?'success':'error');
    renderAll();
  }

  function setStatus(msg, cls) {
    const el = $('backup-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'backup-status ' + (cls||'');
    if (cls==='success'||cls==='error') setTimeout(()=>{ el.textContent=''; el.className='backup-status'; }, 6000);
  }

  return { backup };
})();

/* ────────────── Game ────────────── */
const Game = (() => {
  const W = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const cells = document.querySelectorAll('.cell');
  let board = Array(9).fill(null);
  let turn = 'X';
  let active = false;
  let sc = { X:0, O:0, D:0 };
  let sr = { X:0, O:0, D:0, n:0 };
  let nm = { X:'', O:'' };

  function start() {
    board = Array(9).fill(null);
    turn = 'X'; active = false;
    sc = { X:0, O:0, D:0 };
    sr = { X:0, O:0, D:0, n:0 };
    cells.forEach(c => { c.removeAttribute('data-mark'); c.classList.remove('placed','winning-cell'); c.disabled = true; });
    $('result-banner').hidden = true;
    $('series-result-overlay').hidden = true;
    const wl = $('win-line'); wl.style.transition='none'; wl.style.strokeDashoffset=500;
    for (let i=1;i<=3;i++) { const s=$('round-'+i); if(s){s.className='round-slot'; s.querySelector('.round-result').innerHTML='<span class="result-empty">—</span>'; } }
    $('val-x').textContent=0; $('val-o').textContent=0; $('val-draw').textContent=0;
    $('score-x').classList.remove('active-card'); $('score-o').classList.remove('active-card');
    $('start-overlay').classList.remove('hidden');
    $('turn-indicator').innerHTML='Pressione <strong>Jogar</strong> para iniciar';
  }

  function activate() {
    active = true;
    cells.forEach(c => c.disabled = false);
    $('start-overlay').classList.add('hidden');
    $('turn-indicator').innerHTML=`Vez de <strong>${nm[turn]}</strong>`;
    $('score-'+turn.toLowerCase()).classList.add('active-card');
  }

  async function play(i) {
    if (!active || board[i]) return;
    board[i] = turn;
    cells[i].setAttribute('data-mark', turn);
    cells[i].classList.add('placed');

    const res = check();
    if (res) { active=false; await done(res); }
    else { turn=turn==='X'?'O':'X'; $('turn-indicator').innerHTML=`Vez de <strong>${nm[turn]}</strong>`; $('score-x').classList.toggle('active-card',turn==='X'); $('score-o').classList.toggle('active-card',turn==='O'); }
  }

  function check() {
    for (const c of W) { if(board[c[0]]&&board[c[0]]===board[c[1]]&&board[c[0]]===board[c[2]]) return {w:board[c[0]],c}; }
    if(board.every(Boolean)) return {d:true};
    return null;
  }

  async function done(res) {
    sr.n++;
    cells.forEach(c => c.disabled = true);

    if (res.d) {
      sc.D++; sr.D++;
      const s = $('round-'+sr.n);
      s.className='round-slot filled draw';
      s.querySelector('.round-result').innerHTML='<span class="result-draw">Empate</span>';
      $('result-text').textContent='Empate!'; $('result-text').style.color='var(--draw-clr)';
    } else {
      const w = res.w;
      sc[w]++; sr[w]++;
      res.c.forEach(i => cells[i].classList.add('winning-cell'));
      // Win line
      const LC={'0,1,2':[50,50,250,50],'3,4,5':[50,150,250,150],'6,7,8':[50,250,250,250],'0,3,6':[50,50,50,250],'1,4,7':[150,50,150,250],'2,5,8':[250,50,250,250],'0,4,8':[50,50,250,250],'2,4,6':[250,50,50,250]};
      const [x1,y1,x2,y2]=LC[res.c.join(',')]||[0,0,0,0];
      const wl=$('win-line'); wl.setAttribute('x1',x1);wl.setAttribute('y1',y1);wl.setAttribute('x2',x2);wl.setAttribute('y2',y2);
      const len=Math.hypot(x2-x1,y2-y1)+20; wl.style.strokeDasharray=len;wl.style.strokeDashoffset=len;
      requestAnimationFrame(()=>{wl.style.transition='stroke-dashoffset .5s';wl.style.strokeDashoffset=0;});
      // Round
      const s = $('round-'+sr.n);
      s.className='round-slot filled '+w+'-win';
      s.querySelector('.round-result').innerHTML=`<span class="result-winner">${nm[w]}</span> <span class="result-score">${sc.X}x${sc.O}</span>`;
      // Banner
      $('result-text').textContent=nm[w]+' venceu a rodada!'; $('result-text').style.color='var(--accent)';
    }

    $('val-x').textContent=sc.X; $('val-o').textContent=sc.O; $('val-draw').textContent=sc.D;

    // Fim de série?
    const ended = sr.X>=2 || sr.O>=2 || sr.n>=3;
    if (ended) {
      let win;
      if(sr.X>=2) win=nm.X;
      else if(sr.O>=2) win=nm.O;
      else win=sc.X>sc.O?nm.X:sc.O>sc.X?nm.O:'Empate';

      await DB.addSeries(nm.X, nm.O, sr.X, sr.O, sr.D, sr.n, win);

      $('start-overlay').classList.add('hidden');
      $('series-winner-name').textContent = win;
      $('series-final-score').textContent = sr.X+' x '+sr.O;
      $('series-result-overlay').hidden = false;

      renderAll();
      return;
    }

    // Próxima rodada
    setTimeout(()=>{
      // LIMPA o tabuleiro para a próxima rodada
      board = Array(9).fill(null);
      cells.forEach(c => { c.removeAttribute('data-mark'); c.classList.remove('placed','winning-cell'); });
      // Limpa linha de vitória
      const wl=$('win-line'); wl.style.transition='none'; wl.style.strokeDashoffset=500;
      // Mostra overlay
      $('start-overlay').classList.remove('hidden');
      $('turn-indicator').innerHTML='Pressione <strong>Jogar</strong> para iniciar';
    }, 1800);
  }

  function restart() { turn='X'; start(); }

  function newSeries() {
    nm.X=''; nm.O='';
    $('name-x').textContent='Jogador X'; $('name-o').textContent='Jogador O';
    $('names-modal').hidden=false;
    $('input-name-x').value=''; $('input-name-o').value='';
    start();
  }

  function setName(p, v) {
    const c = v.replace(/[^a-zA-Zà-úÀ-Ú\s]/g,'').trim();
    if(!c) return false;
    nm[p]=c.toUpperCase();
    $('name-'+p.toLowerCase()).textContent=nm[p];
    return true;
  }

  return { start, activate, play, restart, newSeries, setName, nm };
})();

/* ────────────── Helpers ────────────── */
const $ = id => document.getElementById(id);
let _tt;
function toast(m){ clearTimeout(_tt); const t=$('toast');t.textContent=m;t.classList.add('show');_tt=setTimeout(()=>t.classList.remove('show'),2500); }

async function renderAll() {
  // Top winners
  const tw = await DB.getTopWinners();
  const el = $('top-winners-list');
  if(!tw.length) el.innerHTML='<li class="empty-state">Nenhum registro ainda.</li>';
  else el.innerHTML = tw.map((p,i)=>`<li class="top-winner-item"><span class="top-winner-rank">${i===0?'👑':i+1}</span><span class="top-winner-name">${p.name}</span><span class="top-winner-wins">${p.won} ${p.won===1?'série':'séries'}</span></li>`).join('');

  // History
  const hs = await DB.getSeries();
  const hel = $('series-history-list');
  if(!hs.length) hel.innerHTML='<li class="empty-state">Nenhuma série jogada.</li>';
  else {
    hel.innerHTML = hs.map(s=>{
      const cls=s.winner==='Empate'?'draw':s.winner===s.player_x?'x-win':'o-win';
      const d=new Date(s.created);
      return `<li class="series-history-item ${cls}"><span class="series-players">${s.player_x} <span class="series-score">${s.score_x}x${s.score_o}</span> ${s.player_o}</span><span class="series-winner">${s.winner==='Empate'?'Empate':'🏆 '+s.winner}</span><span class="series-date">${d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} ${d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span></li>`;
    }).join('');
  }
}

/* ────────────── PWA ────────────── */
const PWA = (() => {
  let pr=null;
  function reg(){ if('serviceWorker'in navigator) navigator.serviceWorker.register('service-worker.js').catch(()=>{}); }
  function listen(){ window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();pr=e;showBar()}); window.addEventListener('appinstalled',()=>{rmBar();toast('App instalado! 🎉')}); }
  function showBar(){ if($('install-bar'))return; const b=document.createElement('div');b.id='install-bar';b.innerHTML='<p><strong>Instalar</strong> para jogar offline.</p><button class="btn btn-primary small" id="install-btn">Instalar</button><button class="btn btn-ghost small" id="install-dismiss">Agora não</button>';document.body.appendChild(b);$('install-btn').onclick=async()=>{if(!pr)return;pr.prompt();await pr.userChoice;pr=null;rmBar()};$('install-dismiss').onclick=rmBar; }
  function rmBar(){ $('install-bar')?.remove(); }
  return {reg,listen};
})();

/* ────────────── INIT ────────────── */
function init() {
  // Células
  document.querySelectorAll('.cell').forEach(c => c.addEventListener('click', () => Game.play(+c.dataset.idx)));

  // Botões
  $('play-btn').addEventListener('click', () => Game.activate());
  $('new-series-btn').addEventListener('click', Game.newSeries);
  $('next-btn').addEventListener('click', Game.restart);
  $('restart-btn').addEventListener('click', () => { Game.restart(); toast('Reiniciada'); });
  $('backup-btn').addEventListener('click', Supa.backup);

  // Nomes
  $('save-names-btn').addEventListener('click', () => {
    const nx=$('input-name-x').value.trim();
    const no=$('input-name-o').value.trim();
    const cx=nx.replace(/[^a-zA-Zà-úÀ-Ú\s]/g,'').trim();
    const co=no.replace(/[^a-zA-Zà-úÀ-Ú\s]/g,'').trim();
    if(!cx||!co){ toast('Apenas letras!'); return; }
    Game.setName('X', cx);
    Game.setName('O', co);
    $('names-modal').hidden=true;
    toast(Game.nm.X+' vs '+Game.nm.O+' — Melhor de 3!');
    setTimeout(Game.start, 300);
  });

  // Inputs
  ['input-name-x','input-name-o'].forEach(id => {
    const inp=$(id);
    inp.addEventListener('input', e => {
      const v=e.target.value;
      const c=v.replace(/[^a-zA-Zà-úÀ-Ú\s]/g,'');
      if(v!==c) e.target.value=c;
      e.target.style.textTransform='uppercase';
    });
    inp.addEventListener('keydown', e => { if(e.key==='Enter') $('save-names-btn').click(); });
  });

  // Online/offline
  const conn = on => { $('connection-status').textContent=on?'● Online':'● Offline'; $('connection-status').className='dot '+(on?'online':'offline'); };
  window.addEventListener('online',()=>conn(true));
  window.addEventListener('offline',()=>conn(false));
  conn(navigator.onLine);

  // Start
  Game.start();
  renderAll();
  PWA.reg();
  PWA.listen();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
