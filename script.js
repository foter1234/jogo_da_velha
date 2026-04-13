/**
 * ╔══════════════════════════════════════════════════════╗
 * ║  JOGO DA VELHA — script.js                          ║
 * ║  Módulos: Game · DB · Supabase · UI · PWA           ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * CONFIGURAÇÃO SUPABASE:
 *   1. Crie um projeto em https://supabase.com
 *   2. Execute no SQL Editor:
 *      CREATE TABLE winners (
 *        id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *        name       text NOT NULL,
 *        created_at timestamptz DEFAULT now()
 *      );
 *   3. Preencha SUPABASE_URL e SUPABASE_KEY abaixo.
 */

/* ─────────────────────────────────────────────
   ① CONFIGURAÇÃO SUPABASE
   ───────────────────────────────────────────── */
const SUPABASE_URL = 'https://SEU_PROJETO.supabase.co';  // ← substitua
const SUPABASE_KEY = 'SUA_ANON_KEY';                     // ← substitua
const SUPABASE_TABLE = 'winners';
const SUPABASE_CONFIGURED = !SUPABASE_URL.includes('SEU_PROJETO');

/* ─────────────────────────────────────────────
   ② MÓDULO: BANCO DE DADOS LOCAL (IndexedDB)
   ───────────────────────────────────────────── */
const DB = (() => {
  const DB_NAME    = 'tictactoe_db';
  const DB_VERSION = 1;
  const STORE      = 'winners';
  let db = null;

  /** Abre/cria o banco IndexedDB */
  function open() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) {
          const store = d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('created_at', 'created_at');
          store.createIndex('synced', 'synced');
        }
      };
      req.onsuccess = e => { db = e.target.result; resolve(db); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  /** Salva um vencedor localmente (synced = false até envio ao Supabase) */
  async function saveWinner(name) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx  = d.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).add({
        name,
        created_at: new Date().toISOString(),
        synced: false
      });
      req.onsuccess = () => resolve(req.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  /** Retorna todos os registros não sincronizados */
  async function getPendingSync() {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx    = d.transaction(STORE, 'readonly');
      const idx   = tx.objectStore(STORE).index('synced');
      const req   = idx.getAll(false);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  /** Marca registros como sincronizados */
  async function markSynced(ids) {
    const d = await open();
    const tx = d.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const id of ids) {
      store.get(id).onsuccess = e => {
        const rec = e.target.result;
        if (rec) { rec.synced = true; store.put(rec); }
      };
    }
    return new Promise(resolve => { tx.oncomplete = resolve; });
  }

  /** Retorna todos os vencedores em ordem decrescente */
  async function getAll() {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx  = d.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result.reverse());
      req.onerror   = e => reject(e.target.error);
    });
  }

  /** Apaga todo o histórico */
  async function clearAll() {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx  = d.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).clear();
      req.onsuccess = resolve;
      req.onerror   = e => reject(e.target.error);
    });
  }

  return { saveWinner, getPendingSync, markSynced, getAll, clearAll };
})();

/* ─────────────────────────────────────────────
   ③ MÓDULO: SUPABASE SYNC
   ───────────────────────────────────────────── */
const SupaSync = (() => {
  /** Envia um array de registros locais ao Supabase */
  async function push(records) {
    if (!SUPABASE_CONFIGURED || !records.length) return [];
    const payload = records.map(r => ({ name: r.name, created_at: r.created_at }));
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
    return records.map(r => r.id);
  }

  /** Tenta sincronizar pendentes; silencia erros de rede */
  async function syncPending() {
    if (!navigator.onLine || !SUPABASE_CONFIGURED) return;
    try {
      const pending = await DB.getPendingSync();
      if (!pending.length) return;
      const synced = await push(pending);
      await DB.markSynced(synced);
      UI.setSyncLabel(`✓ ${synced.length} registro(s) sincronizado(s)`);
      setTimeout(() => UI.setSyncLabel(''), 3000);
    } catch (err) {
      console.warn('[SupaSync] falha:', err.message);
    }
  }

  return { push, syncPending };
})();

/* ─────────────────────────────────────────────
   ④ MÓDULO: LÓGICA DO JOGO
   ───────────────────────────────────────────── */
const Game = (() => {
  /* Todas as combinações vencedoras [linha, col inicial, col final ou diag] */
  const WIN_COMBOS = [
    [0,1,2],[3,4,5],[6,7,8],  // linhas
    [0,3,6],[1,4,7],[2,5,8],  // colunas
    [0,4,8],[2,4,6]           // diagonais
  ];

  let board      = Array(9).fill(null); // 'X' | 'O' | null
  let current    = 'X';
  let gameActive = false;

  // Placar acumulado
  const score = { X: 0, O: 0, draw: 0 };

  // Série melhor de 3
  const series = { X: 0, O: 0, total: 0 };

  // Nomes dos jogadores
  const names = {
    X: localStorage.getItem('name_X') || 'Jogador X',
    O: localStorage.getItem('name_O') || 'Jogador O'
  };

  /** Inicia ou reinicia uma partida */
  function startGame() {
    board      = Array(9).fill(null);
    gameActive = true;
    UI.clearBoard();
    UI.hideBanner();
    UI.clearWinLine();
    UI.updateTurnIndicator(current, names[current]);
    UI.highlightActiveScore(current);
  }

  /** Processa jogada na célula idx */
  async function makeMove(idx) {
    if (!gameActive || board[idx]) return;
    board[idx] = current;
    UI.markCell(idx, current);

    const result = checkResult();
    if (result) {
      gameActive = false;
      await handleResult(result);
    } else {
      current = current === 'X' ? 'O' : 'X';
      UI.updateTurnIndicator(current, names[current]);
      UI.highlightActiveScore(current);
    }
  }

  /** Verifica resultado; retorna { winner, combo } ou { draw: true } ou null */
  function checkResult() {
    for (const combo of WIN_COMBOS) {
      const [a, b, c] = combo;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winner: board[a], combo };
      }
    }
    if (board.every(Boolean)) return { draw: true };
    return null;
  }

  /** Trata o resultado final da partida */
  async function handleResult(result) {
    if (result.draw) {
      score.draw++;
      UI.showBanner('Empate!', false);
    } else {
      const w = result.winner;
      score[w]++;
      series[w]++;
      series.total++;
      UI.highlightWinningCells(result.combo);
      UI.drawWinLine(result.combo);
      UI.showBanner(`${names[w]} venceu! ${w === 'X' ? '✕' : '◯'}`, true);
      UI.updateScores(score);
      UI.updateBO3(series);

      // Persiste vencedor
      await DB.saveWinner(names[w]);
      await UI.refreshWinnersList();
      await SupaSync.syncPending();

      // Verifica fim de série (melhor de 3 = 2 vitórias)
      if (series[w] >= 2) {
        UI.showBanner(`🏆 ${names[w]} venceu a série!`, true);
      }
    }
    UI.updateScores(score);
  }

  /** Reinicia apenas a partida atual */
  function restartGame() {
    current = 'X';
    startGame();
  }

  /** Reinicia toda a série */
  function resetSeries() {
    series.X = 0; series.O = 0; series.total = 0;
    score.X  = 0; score.O  = 0; score.draw  = 0;
    current  = 'X';
    UI.updateScores(score);
    UI.updateBO3(series);
    startGame();
  }

  /** Atualiza nome de jogador */
  function setName(player, name) {
    names[player] = name.trim() || `Jogador ${player}`;
    localStorage.setItem(`name_${player}`, names[player]);
    UI.updatePlayerNames(names);
    UI.updateTurnIndicator(current, names[current]);
  }

  function getNames() { return { ...names }; }

  /* ── MINIMAX stub (pronto para IA futura) ── */
  // function bestMove(board, player) { /* implementar minimax */ }

  return { startGame, makeMove, restartGame, resetSeries, setName, getNames, score, series };
})();

/* ─────────────────────────────────────────────
   ⑤ MÓDULO: INTERFACE (UI)
   ───────────────────────────────────────────── */
const UI = (() => {
  /* ── refs ── */
  const $  = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  const cells        = $$('.cell');
  const board        = $('board');
  const banner       = $('result-banner');
  const resultText   = $('result-text');
  const nextBtn      = $('next-btn');
  const resetSerBtn  = $('reset-series-btn');
  const restartBtn   = $('restart-btn');
  const editNamesBtn = $('edit-names-btn');
  const currentName  = $('current-player-name');
  const turnInd      = $('turn-indicator');
  const winnersList  = $('winners-list');
  const historyBtn   = $('history-btn');
  const winLineSvg   = $('win-line');
  const connStatus   = $('connection-status');
  const syncLabel    = $('sync-status');
  const namesModal   = $('names-modal');
  const histModal    = $('history-modal');
  const saveNamesBtn = $('save-names-btn');
  const cancelNames  = $('cancel-names-btn');
  const closeHist    = $('close-history-btn');
  const clearHist    = $('clear-history-btn');
  const histTbody    = $('history-tbody');
  const toast        = $('toast');

  let toastTimer;

  /* ── board ── */
  function markCell(idx, mark) {
    const cell = cells[idx];
    cell.setAttribute('data-mark', mark);
    cell.setAttribute('aria-label', `Célula ${idx + 1}: ${mark}`);
    requestAnimationFrame(() => cell.classList.add('placed'));
  }

  function clearBoard() {
    cells.forEach(c => {
      c.removeAttribute('data-mark');
      c.classList.remove('placed', 'winning-cell');
      c.disabled = false;
      c.setAttribute('aria-label', `Célula ${Number(c.dataset.idx) + 1}`);
    });
    $$('.cell').forEach(c => c.disabled = false);
  }

  function disableBoard() {
    cells.forEach(c => c.disabled = true);
  }

  function highlightWinningCells(combo) {
    combo.forEach(i => cells[i].classList.add('winning-cell'));
    disableBoard();
  }

  /* ── win line ── */
  /**
   * Desenha a linha SVG sobre o combo vencedor.
   * O viewBox é 300×300 (3 células de 100 cada).
   */
  const CELL_PX = 100;
  const LINE_COORDS = {
    // linhas
    '0,1,2': [50, 50, 250, 50],
    '3,4,5': [50, 150, 250, 150],
    '6,7,8': [50, 250, 250, 250],
    // colunas
    '0,3,6': [50, 50, 50, 250],
    '1,4,7': [150, 50, 150, 250],
    '2,5,8': [250, 50, 250, 250],
    // diags
    '0,4,8': [50, 50, 250, 250],
    '2,4,6': [250, 50, 50, 250]
  };

  function drawWinLine(combo) {
    const key = combo.join(',');
    const [x1, y1, x2, y2] = LINE_COORDS[key] || [0, 0, 0, 0];
    winLineSvg.setAttribute('x1', x1);
    winLineSvg.setAttribute('y1', y1);
    winLineSvg.setAttribute('x2', x2);
    winLineSvg.setAttribute('y2', y2);
    // total path approx 200 → reset dasharray
    const len = Math.hypot(x2 - x1, y2 - y1) + 20;
    winLineSvg.style.strokeDasharray  = len;
    winLineSvg.style.strokeDashoffset = len;
    requestAnimationFrame(() => {
      winLineSvg.style.transition = 'stroke-dashoffset 0.5s cubic-bezier(.4,0,.2,1)';
      winLineSvg.style.strokeDashoffset = 0;
    });
  }

  function clearWinLine() {
    winLineSvg.style.transition = 'none';
    winLineSvg.style.strokeDashoffset = 500;
    winLineSvg.setAttribute('x1', 0);
    winLineSvg.setAttribute('y1', 0);
    winLineSvg.setAttribute('x2', 0);
    winLineSvg.setAttribute('y2', 0);
  }

  /* ── turn / score ── */
  function updateTurnIndicator(player, name) {
    turnInd.innerHTML = `Vez de <strong>${name}</strong>`;
    turnInd.className = `turn-indicator player-${player.toLowerCase()}`;
  }

  function highlightActiveScore(player) {
    document.getElementById('score-x').classList.toggle('active-card', player === 'X');
    document.getElementById('score-o').classList.toggle('active-card', player === 'O');
  }

  function updateScores(score) {
    $('val-x').textContent    = score.X;
    $('val-o').textContent    = score.O;
    $('val-draw').textContent = score.draw;
  }

  function updatePlayerNames(names) {
    $('name-x').textContent = names.X;
    $('name-o').textContent = names.O;
  }

  function updateBO3(series) {
    const xDots = [$('bo3-x-1'), $('bo3-x-2')];
    const oDots = [$('bo3-o-1'), $('bo3-o-2')];
    xDots.forEach((d, i) => {
      d.className = 'bo3-dot' + (i < series.X ? ' won-x' : '');
    });
    oDots.forEach((d, i) => {
      d.className = 'bo3-dot' + (i < series.O ? ' won-o' : '');
    });
  }

  /* ── banner ── */
  function showBanner(text, isWin) {
    resultText.textContent = text;
    resultText.style.color = isWin ? 'var(--accent)' : 'var(--draw-clr)';
    banner.hidden = false;
    disableBoard();
  }

  function hideBanner() {
    banner.hidden = true;
  }

  /* ── winners list (right panel) ── */
  async function refreshWinnersList() {
    const all = await DB.getAll();
    const recent = all.slice(0, 10);
    if (!recent.length) {
      winnersList.innerHTML = '<li class="empty-state">Nenhum vencedor ainda.</li>';
      return;
    }
    winnersList.innerHTML = recent.map((w, i) => `
      <li class="winner-item${i === 0 ? ' new-entry' : ''}">
        <span class="winner-name">${escapeHtml(w.name)}</span>
        <span class="winner-date">${fmtDate(w.created_at)}</span>
      </li>
    `).join('');
    // remove new-entry highlight after animation
    setTimeout(() => {
      winnersList.querySelector('.new-entry')?.classList.remove('new-entry');
    }, 2000);
  }

  /* ── history modal ── */
  async function openHistoryModal() {
    const all = await DB.getAll();
    if (!all.length) {
      histTbody.innerHTML = '<tr class="empty-row"><td colspan="4">Nenhum registro.</td></tr>';
    } else {
      histTbody.innerHTML = all.map((w, i) => {
        const d = new Date(w.created_at);
        return `<tr>
          <td>${all.length - i}</td>
          <td>${escapeHtml(w.name)}</td>
          <td>${d.toLocaleDateString('pt-BR')}</td>
          <td>${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
        </tr>`;
      }).join('');
    }
    histModal.hidden = false;
  }

  /* ── connection status ── */
  function setOnline(online) {
    connStatus.textContent = online ? '● Online' : '● Offline';
    connStatus.className   = `dot ${online ? 'online' : 'offline'}`;
  }

  function setSyncLabel(txt) {
    syncLabel.textContent = txt;
  }

  /* ── toast ── */
  function showToast(msg, duration = 2500) {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  /* ── modals ── */
  function openNamesModal(names) {
    $('input-name-x').value = names.X;
    $('input-name-o').value = names.O;
    namesModal.hidden = false;
    $('input-name-x').focus();
  }

  function closeNamesModal() {
    namesModal.hidden = true;
  }

  function closeHistoryModal() {
    histModal.hidden = true;
  }

  /* ── helpers ── */
  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  /* ── event wiring ── */
  function wireEvents() {
    // Board cells
    cells.forEach(cell => {
      cell.addEventListener('click', () => {
        const idx = Number(cell.dataset.idx);
        Game.makeMove(idx);
      });
    });

    // Game controls
    nextBtn.addEventListener('click', () => Game.restartGame());
    resetSerBtn.addEventListener('click', () => Game.resetSeries());
    restartBtn.addEventListener('click', () => {
      Game.restartGame();
      showToast('Partida reiniciada');
    });

    // Names modal
    editNamesBtn.addEventListener('click', () => openNamesModal(Game.getNames()));
    saveNamesBtn.addEventListener('click', () => {
      const nx = $('input-name-x').value.trim();
      const no = $('input-name-o').value.trim();
      Game.setName('X', nx);
      Game.setName('O', no);
      closeNamesModal();
      showToast('Nomes salvos!');
    });
    cancelNames.addEventListener('click', closeNamesModal);
    namesModal.addEventListener('click', e => { if (e.target === namesModal) closeNamesModal(); });

    // History modal
    historyBtn.addEventListener('click', openHistoryModal);
    closeHist.addEventListener('click', closeHistoryModal);
    histModal.addEventListener('click', e => { if (e.target === histModal) closeHistoryModal(); });
    clearHist.addEventListener('click', async () => {
      if (!confirm('Apagar todo o histórico? Esta ação não pode ser desfeita.')) return;
      await DB.clearAll();
      closeHistoryModal();
      await refreshWinnersList();
      showToast('Histórico apagado');
    });

    // Enter to save names
    [$('input-name-x'), $('input-name-o')].forEach(inp => {
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') saveNamesBtn.click(); });
    });

    // Connection
    window.addEventListener('online',  () => { setOnline(true);  SupaSync.syncPending(); });
    window.addEventListener('offline', () => setOnline(false));
    setOnline(navigator.onLine);
  }

  return {
    markCell, clearBoard, disableBoard,
    highlightWinningCells, drawWinLine, clearWinLine,
    updateTurnIndicator, highlightActiveScore,
    updateScores, updatePlayerNames, updateBO3,
    showBanner, hideBanner,
    refreshWinnersList,
    setOnline, setSyncLabel,
    showToast, openNamesModal,
    wireEvents
  };
})();

/* ─────────────────────────────────────────────
   ⑥ MÓDULO: PWA — Service Worker + Install
   ───────────────────────────────────────────── */
const PWA = (() => {
  let deferredPrompt = null;

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('service-worker.js')
      .then(reg => console.log('[SW] registrado:', reg.scope))
      .catch(err => console.warn('[SW] falha:', err));
  }

  function listenInstallPrompt() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredPrompt = e;
      showInstallBar();
    });
    window.addEventListener('appinstalled', () => {
      removeInstallBar();
      UI.showToast('App instalado com sucesso! 🎉');
    });
  }

  function showInstallBar() {
    if (document.getElementById('install-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'install-bar';
    bar.innerHTML = `
      <p><strong>Instalar o app</strong> para jogar offline a qualquer momento.</p>
      <button class="btn btn-primary small" id="install-btn">Instalar</button>
      <button class="btn btn-ghost small" id="install-dismiss">Agora não</button>
    `;
    document.body.appendChild(bar);
    document.getElementById('install-btn').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      removeInstallBar();
    });
    document.getElementById('install-dismiss').addEventListener('click', removeInstallBar);
  }

  function removeInstallBar() {
    document.getElementById('install-bar')?.remove();
  }

  return { registerSW, listenInstallPrompt };
})();

/* ─────────────────────────────────────────────
   ⑦ INICIALIZAÇÃO
   ───────────────────────────────────────────── */
(async () => {
  // Registra eventos de UI
  UI.wireEvents();

  // Atualiza nomes salvos
  UI.updatePlayerNames(Game.getNames());

  // Carrega lista de vencedores
  await UI.refreshWinnersList();

  // Sincroniza pendentes se online
  await SupaSync.syncPending();

  // Inicia partida
  Game.startGame();

  // PWA
  PWA.registerSW();
  PWA.listenInstallPrompt();

  console.log('%cJogo da Velha iniciado!', 'color:#ffe066;font-size:16px;font-weight:bold;');
  if (!SUPABASE_CONFIGURED) {
    console.info('%c[Supabase] Não configurado. Edite SUPABASE_URL e SUPABASE_KEY em script.js.', 'color:#4dd9ff');
  }
})();
