# Como Gerar o Instalador (.exe) — Olympus Painel

Este guia explica como qualquer desenvolvedor pode gerar um instalador profissional para distribuição.

---

## Pre-requisitos (apenas uma vez)

- **Node.js** v18+ — https://nodejs.org
- **Python** 3.11+ — https://python.org (marcar "Add to PATH" na instalacao)
- **Git** (opcional, para controle de versao)

---

## Gerando o instalador (a cada versao)

Abra o **PowerShell** na pasta raiz do projeto e execute:

.\build.ps1

O script vai:
1. Instalar dependencias Python automaticamente
2. Baixar o Chromium do Playwright (uma vez)
3. Compilar o backend Flask em backend.exe via PyInstaller
4. Compilar o frontend React com Vite
5. Empacotar tudo em um instalador NSIS via Electron Builder

Resultado:
  release/1.0.0/OlympusPainel-Setup-v1.0.0.exe  <-- Distribua este arquivo

---

## Como atualizar a versao

Antes de rodar .\build.ps1, atualize o campo "version" em package.json:
  "version": "1.1.0"

---

## Atalhos uteis

| Comando                        | O que faz                                       |
|--------------------------------|-------------------------------------------------|
| npm run dev                    | Inicia o frontend Vite em localhost:9000        |
| npm run dev:full               | Inicia Vite + Electron juntos (modo dev)        |
| .\build.ps1 -SkipBackend       | Pula compilacao Python (so alterou frontend)    |
| .\build.ps1 -SkipFrontend      | Pula compilacao React (so alterou backend)      |
| .\build.ps1 -Verbose           | Mostra mais logs durante o build                |

---

## Dados do usuario

O banco de dados e uploads ficam em:
  C:\Users\<nome>\AppData\Roaming\OlympusPainel\

Isso garante que NENHUM DADO seja perdido ao instalar uma nova versao.
