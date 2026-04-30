# 🎮 Jogo da Velha — PWA

Jogo da Velha moderno para 2 jogadores, com PWA, placar "melhor de 3", histórico de vencedores em IndexedDB e sincronização opcional com Supabase.

---

## 📁 Estrutura de Arquivos

```
tictactoe/
├── index.html          ← Estrutura HTML + modais
├── style.css           ← Design dark luxury + responsivo
├── script.js           ← Lógica do jogo, IndexedDB, Supabase, PWA
├── service-worker.js   ← Cache offline (Cache-first)
├── manifest.json       ← Configuração PWA
├── icons/
│   ├── icon-192.png    ← Ícone do app (192×192)
│   └── icon-512.png    ← Ícone do app (512×512)
└── README.md           ← Este arquivo
```

---

## 🚀 Como usar

### Opção 1 — Servidor local (recomendado para PWA)

```bash
# Python
python3 -m http.server 8080

# Node.js (npx)
npx serve .

# VS Code: extensão "Live Server"
```

Acesse: `http://localhost:8080`

> **Atenção:** O Service Worker e o manifest PWA exigem HTTPS ou localhost. Abrir `index.html` diretamente pelo sistema de arquivos (`file://`) não ativa todas as funcionalidades PWA.

### Opção 2 — Deploy estático (Vercel, Netlify, GitHub Pages)

Basta fazer upload da pasta `tictactoe/` — todos os arquivos são estáticos.

---

## ☁️ Configurar Supabase (opcional)

O jogo funciona 100% offline/local sem Supabase. A integração só serve para backup em nuvem.

### Passo 1 — Criar projeto

1. Acesse [https://supabase.com](https://supabase.com) e crie um projeto gratuito.

### Passo 2 — Criar tabela `winners`

No **SQL Editor** do Supabase, execute:

```sql
CREATE TABLE winners (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Política para insert público (ajuste conforme necessário)
ALTER TABLE winners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_insert" ON winners FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_select" ON winners FOR SELECT USING (true);
```

### Passo 3 — Obter credenciais

Em **Settings → API**:
- **Project URL** → `https://xxxx.supabase.co`
- **anon / public key** → chave longa começando com `eyJ...`

### Passo 4 — Configurar `script.js`

Abra `script.js` e substitua as linhas no topo:

```js
const SUPABASE_URL = 'https://xxxx.supabase.co';   // ← sua URL
const SUPABASE_KEY = 'eyJ...';                      // ← sua chave anon
```

Salve o arquivo. Na próxima partida, os vencedores serão enviados ao Supabase automaticamente quando houver internet.

---

## 🎯 Funcionalidades

| Funcionalidade | Detalhes |
|---|---|
| 2 jogadores local | Turnos alternados com destaque visual |
| Melhor de 3 | Indicadores de vitórias por série |
| Placar acumulado | X, O e Empates |
| Editar nomes | Persistido em localStorage |
| Linha de vitória animada | SVG com animação de traçado |
| Últimos 10 vencedores | Painel direito com animação |
| Histórico completo | Modal com tabela paginada |
| Limpar histórico | Com confirmação |
| IndexedDB | Armazena vencedores com timestamp |
| Supabase sync | Sincroniza pendentes ao voltar online |
| Indicador online/offline | Barra de status em tempo real |
| PWA | Manifest + Service Worker + instalável |
| Responsivo | Desktop, tablet, mobile |

---

## 🧠 Estrutura do Código

O `script.js` é dividido em módulos IIFE isolados:

- **`DB`** — Toda a camada IndexedDB (CRUD de vencedores)
- **`SupaSync`** — Comunicação com Supabase REST API
- **`Game`** — Lógica pura do jogo (estado, turnos, vitória, série)
- **`UI`** — Manipulação de DOM, eventos, animações
- **`PWA`** — Registro de Service Worker + prompt de instalação

> **IA futura:** O módulo `Game` tem um stub comentado `bestMove(board, player)` pronto para receber a implementação do algoritmo Minimax.

---

## 📱 Instalar como app

1. Abra o site no Chrome/Edge (desktop ou Android)
2. Clique na barra de instalação que aparece no rodapé **ou**
3. No menu do navegador → "Adicionar à tela inicial" / "Instalar app"

No iOS Safari: menu compartilhar → "Adicionar à Tela de Início".
