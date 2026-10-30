# Olympus Painel

Plataforma de prospecção e gestão de leads, com painel desktop, backend local e painel administrativo web.

## Recursos

- Busca de empresas por categoria e localização, com integração ao Google Maps / Places.
- Gestão de leads com lista, mapa, Kanban, status e detalhes de contato.
- Dashboard, reuniões, contratos e geração de documentos.
- Módulos de mensagens, WhatsApp, Instagram e assistência de IA, sujeitos à configuração dos serviços externos.
- Aplicativo desktop Electron e painel administrativo com integração ao Supabase.

## Tecnologias

React, TypeScript, Vite, Tailwind CSS, Electron, Python, Flask, SQLite, Playwright, Leaflet, Recharts e Supabase.

## Desenvolvimento local

Requer Node.js compatível com o Vite 8, npm e Python. O script `dev:backend` utiliza o launcher Windows `py -3.14`; para outra versão compatível, inicie o backend manualmente conforme abaixo.

```sh
npm ci
python -m pip install -r backend/requirements.txt
```

Copie `.env.example` para `.env` e configure seu projeto Supabase. Consulte também `backend/.env.example` para os serviços de busca e IA. As chaves devem ser suas e os arquivos `.env` ficam fora do Git. Scripts de infraestrutura usam `DAYTONA_API_KEY` do ambiente.

Em terminais separados:

```sh
# Frontend: http://localhost:9000
npm run dev
```

```sh
# Backend: http://localhost:9001
cd backend
python app.py
```

Com o frontend e o backend ativos, `npm run dev:electron` abre o aplicativo desktop em modo de desenvolvimento.

A busca requer o scraper ou uma chave de API configurada conforme o [guia do backend](backend/README.md). O painel principal requer configuração própria de usuários; não há senha administrativa universal incluída no código. O painel `olympus-admin` usa as variáveis do seu projeto Supabase conforme seu [guia de implantação](olympus-admin/README_DEPLOY_VERCEL.md).

## Build

```sh
npm run build
npm run lint
```

Para o instalador Windows e seus requisitos adicionais, consulte [README-BUILD.md](README-BUILD.md).

## Organização

- `src/`: interface, páginas e componentes de gestão.
- `backend/`: API Flask, busca, persistência, integrações e rotinas de IA.
- `electron/`: integração desktop.
- `olympus-admin/`: painel administrativo web.
- `scripts/`: automação de desenvolvimento e implantação.

Uploads, bancos, exportações de leads e credenciais são dados locais e não fazem parte do repositório público. As integrações dependem de serviços externos e exigem configuração própria. Esta publicação do código não representa uma auditoria completa de segurança para uso em produção.

**[Perfil](https://github.com/ryuclover) · [Guia dos projetos](https://github.com/ryuclover/Guia-dos-meus-projetos)**
