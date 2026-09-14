# Olympus Admin — Painel Web de Gestão & Licenciamento

Projeto web independente criado para ser hospedado gratuitamente na **Vercel** para você gerenciar contas, aprovar acessos, bloquear usuários e definir planos do aplicativo `.exe` do Olympus.

---

## 1. Passo a Passo para Deploy na Vercel (Custo R$ 0,00)

### Opção A: Deploy pelo GitHub (Recomendado)
1. Suba esta pasta (`olympus-admin`) para um repositório no seu GitHub.
2. Acesse [vercel.com](https://vercel.com) e conecte sua conta do GitHub.
3. Clique em **"Add New Project"** e selecione o repositório `olympus-admin`.
4. Em **Root Directory**, selecione `olympus-admin` (ou a raiz se tiver criado um repositório exclusivo para ele).
5. Clique em **"Deploy"**! Em menos de 1 minuto seu painel estará online com link seguro `https://seu-admin.vercel.app`.

### Opção B: Deploy direto via Terminal
Na pasta `olympus-admin`:
```bash
npx vercel
```

---

## 2. Conectando ao Banco Gratuito (Supabase)

1. Crie uma conta gratuita em [supabase.com](https://supabase.com) e crie um novo projeto (ex: `olympus-db`).
2. Vá em **SQL Editor** no painel do Supabase e cole o conteúdo do arquivo `schema.sql`. Clique em **Run**.
3. Vá em **Project Settings -> API** e copie:
   * **Project URL**
   * **anon public key**
4. No painel da Vercel (em **Settings -> Environment Variables**), adicione:
   * `VITE_SUPABASE_URL` = sua Project URL
   * `VITE_SUPABASE_ANON_KEY` = sua anon public key
5. Pronto! Todas as contas criadas pelo Admin serão salvas no PostgreSQL na nuvem em tempo real.

---

## 3. Acesso Inicial
* **E-mail:** `admin@olympus.app`
* **Senha Inicial:** `admin123`
