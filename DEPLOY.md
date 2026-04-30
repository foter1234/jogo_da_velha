# ╔══════════════════════════════════════════════════════╗
# ║  DEPLOY NA VERCEL — GUI COMPLETO                    ║
# ║  PWA: Jogo da Velha + Jogo da Memória               ║
# ╚══════════════════════════════════════════════════════╝


## ─── PASSO 1: Preparar o projeto ─────────────────────

### 1.1 Gerar ícones PNG (obrigatório para PWA)
1. No terminal, rode o servidor local:
   cd C:\Users\Usuario\Documents\GitHub\jogo_da_velha
   python -m http.server 8080

2. No navegador, abra:
   http://localhost:8080/icons/generate.html

3. Clique "Gerar PNGs" → salva `icon-192.png` e `icon-512.png` na pasta `icons/`

4. Pare o servidor (Ctrl+C)


### 1.2 Colocar as chaves do Supabase
Edite o arquivo: `jogo_da_velha/js/config.js`

```js
const SUPABASE_URL = 'https://lfemaaetrqbvmdnvhcoy.supabase.co';
const SUPABASE_KEY = 'SUA_ANON_KEY_AQUI';
```

> ⚠️ A `anon key` é PÚBLICA e segura para frontend.
> Nunca use a `service_role` key no frontend!


### 1.3 Verificar a estrutura
Seu projeto deve ter esta estrutura:

```
jogo_da_velha/
├── .gitignore
├── index.html                 ← HOME (2 cards de jogos)
├── manifest.json              ← PWA
├── service-worker.js          ← Cache offline
├── vercel.json                ← Config deploy
├── icons/
│   ├── icon-192.png           ← Gerado no passo 1.1
│   ├── icon-512.png           ← Gerado no passo 1.1
│   └── generate.html
├── img/
│   ├── logoCostelao.png
│   ├── 360.jpg
│   └── teora.png
├── jogo_da_velha/
│   ├── index.html             ← Jogo da Velha
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── config.js          ← Chaves Supabase
│       └── script.js
└── jogo_da_memoria/
    └── index.html             ← Jogo da Memória
```


## ─── PASSO 2: Subir pro GitHub ───────────────────────

### 2.1 Inicializar Git (se ainda não tem)
```bash
cd C:\Users\Usuario\Documents\GitHub\jogo_da_velha
git init
git remote add origin https://github.com/SEU_USER/SEU_REPO.git
```

### 2.2 Commitar tudo
```bash
git add .
git commit -m "PWA Costelão Jogos — Velha + Memória"
git push -u origin main
```

> ⚠️ Se o `.gitignore` está bloqueando o `config.js`,
> adicione manualmente:
>   git add -f jogo_da_velha/js/config.js


## ─── PASSO 3: Deploy na Vercel ───────────────────────

### 3.1 Via GitHub (mais fácil)

1. Acesse **https://vercel.com**
2. Faça login com **GitHub**
3. Clique em **"Add New..."** → **"Project"**
4. Encontre o repo `jogo_da_velha` → clique **"Import"**
5. Configure:
   - **Framework Preset**: `Other`
   - **Root Directory**: `./`
   - **Build Command**: (deixe vazio)
   - **Output Directory**: `./`
6. Clique em **"Deploy"**
7. Aguarde ~30 segundos

✅ Pronto! A Vercel vai gerar um link:
   `https://jogo-da-velha-xyz.vercel.app`


### 3.2 Via CLI (alternativa)

```bash
# Instalar CLI (uma vez só)
npm i -g vercel

# Deploy
cd C:\Users\Usuario\Documents\GitHub\jogo_da_velha
vercel

# Responda:
# Set up and deploy? Y
# Which scope? (selecione sua conta)
# Link to existing project? N
# Project name? costelao-jogos
# Directory? ./
# Override settings? N
```


## ─── PASSO 4: Verificar Supabase ─────────────────────

### 4.1 Tabela existe?
1. Acesse **https://app.supabase.com**
2. Selecione seu projeto
3. Vá em **Table Editor**
4. Veja se a tabela `series` existe

### 4.2 Se NÃO existe, crie:
No **SQL Editor** do Supabase, execute:

```sql
CREATE TABLE series (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_x TEXT,
  player_o TEXT,
  score_x INTEGER DEFAULT 0,
  score_o INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  rounds INTEGER DEFAULT 0,
  winner TEXT,
  synced BOOLEAN DEFAULT false,
  created TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON series FOR SELECT USING (true);
CREATE POLICY "public insert" ON series FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON series FOR UPDATE USING (true);

CREATE INDEX idx_series_synced ON series(synced);
```


## ─── PASSO 5: Testar tudo ────────────────────────────

### 5.1 Acessar o site
Abra o link da Vercel no Chrome:
`https://SEU_PROJETO.vercel.app`

### 5.2 Testar os jogos
1. Clique em **"Jogo da Velha"** → jogue uma série
2. Clique em **"☁ Backup Cloud"**
3. Se aparecer `✓ 1 enviada(s)!` → Supabase funcionando ✅

### 5.3 Verificar no Supabase
1. Supabase → Table Editor → `series`
2. Deve aparecer o registro da partida jogada


## ─── PASSO 6: Instalar como PWA ──────────────────────

### Desktop (Chrome)
1. Na barra de endereço, clique em **⊕** ou **⊿**
2. Clique em **"Instalar"**
3. O app abre em janela própria

### Android (Chrome)
1. Menu **⋮** → **"Adicionar à tela inicial"**
2. Confirme → ícone aparece na home

### iPhone (Safari)
1. Botão **Compartilhar** (quadrado com seta)
2. **"Adicionar à Tela de Início"**
3. Confirme → ícone aparece na home


## ─── PASSO 7: Atualizar o deploy ─────────────────────

Toda vez que fizer alteração no código:

```bash
git add .
git commit -m "descrição da mudança"
git push
```

A Vercel **redeploy automaticamente** a cada push.

Para forçar re-deploy manual:
1. Vercel Dashboard → seu projeto
2. Clique em **"..."** → **"Redeploy"**


## ─── RESUMO RÁPIDO ───────────────────────────────────

1. ✅ Gerar ícones PNG (localhost:8080/icons/generate.html)
2. ✅ Colocar chaves Supabase em `jogo_da_velha/js/config.js`
3. ✅ `git add . && git commit -m "..." && git push`
4. ✅ Importar repo na Vercel → Deploy
5. ✅ Criar tabela `series` no Supabase (se não existe)
6. ✅ Testar: jogar + backup cloud
7. ✅ Instalar como PWA (⊕ na barra de endereço)


## ─── TROUBLESHOOTING ─────────────────────────────────

### ❌ "Manifest não encontrado"
→ Verifique se `manifest.json` existe na raiz do projeto

### ❌ "Service Worker não registra"
→ Verifique se `service-worker.js` existe na raiz

### ❌ "Backup falha"
→ Verifique as chaves no `config.js` e a tabela no Supabase

### ❌ "Ícones não carregam"
→ Gere os PNGs via `icons/generate.html`

### ❌ "App não instala"
→ Precisa de HTTPS (Vercel já fornece)
→ `manifest.json` deve ter `icons` com 192px e 512px
→ Deve ter `service-worker.js` registrado
