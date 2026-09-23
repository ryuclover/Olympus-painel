# Guia de Deploy Gratuito no Google Cloud (GCP Always Free)

Este documento detalha como colocar toda a plataforma **Olympus** (Backend Python + Painel Web + Painel Admin) no ar gratuitamente utilizando o nível **Always Free** do **Google Cloud Platform (GCP)**.

---

## 1. Por que o Google Cloud é Gratuito para esse Projeto?

O Google Cloud possui a política **Always Free Tier** (gratuito para sempre, mesmo após o período de teste):

| Serviço Google Cloud | Cota Gratuita Mensal Vitalícia | Consumo do Olympus |
| :--- | :--- | :--- |
| **Cloud Run** | **2 milhões de requisições/mês**, 360.000 vCPU-segundos, 180.000 GiB-segundos | Escala a **0 instâncias** quando inativo (custo R$ 0) |
| **Cloud Build** | **120 minutos de compilação/dia** | ~2 minutos por deploy |
| **Artifact Registry** | **0,5 GB/mês** de armazenamento de contêiner | Suficiente para a imagem base |
| **SSL / HTTPS** | **Certificados SSL gerenciados gratuitos** e ilimitados | Nativo para todos os serviços |

---

## 2. Arquitetura da Solução Contêinerizada

Com a nova estrutura criada:
* Criamos um **`Dockerfile` multi-stage**:
  * Compila o frontend do **Olympus Painel** (`/dist`).
  * Compila o frontend do **Olympus Admin** (`/olympus-admin/dist`).
  * Constrói o container Python com Flask, Waitress e Playwright.
* O backend Flask responde:
  * `https://seu-app.a.run.app/` ➔ **Painel Olympus Web (CRM & Prospecção)**
  * `https://seu-app.a.run.app/admin` ➔ **Painel Administrativo de Licenças & Contas**
  * `https://seu-app.a.run.app/api/*` ➔ **API REST (Leads, Scraper, Contratos, IA)**
  * `https://seu-app.a.run.app/uploads/*` ➔ **Arquivos e relatórios**

---

## 3. Como Fazer o Deploy (Passo a Passo)

### Passo 1: Instalar o Google Cloud SDK (se ainda não tiver)
Se ainda não tem o `gcloud` instalado no Windows, execute no PowerShell como Administrador:
```powershell
(New-Object Net.WebClient).DownloadFile('https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe', "$env:TEMP\GoogleCloudSDKInstaller.exe"); Start-Process "$env:TEMP\GoogleCloudSDKInstaller.exe"
```
*(Ou baixe pelo site oficial: [cloud.google.com/sdk/docs/install#windows](https://cloud.google.com/sdk/docs/install#windows))*

### Passo 2: Executar o Script Automatizado
No terminal da raiz do projeto, execute:
```powershell
.\deploy_gcp.ps1
```

O script fará automaticamente:
1. Login seguro no Google Cloud pelo navegador.
2. Ativação das APIs gratuitas do Cloud Run.
3. Envio do código e compilação na nuvem do Google.
4. Geração do link HTTPS público com SSL ativo.

---

## 4. Deploy Manual via Terminal (Comando Único)

Se preferir rodar manualmente com comandos da CLI:

```bash
# 1. Autenticar
gcloud auth login

# 2. Definir o projeto
gcloud config set project SEU_PROJECT_ID_AQUI

# 3. Habilitar os serviços gratuitos
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

# 4. Fazer o deploy completo
gcloud run deploy olympus-app \
    --source . \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 2 \
    --port 8080
```

---

## 5. Testando Localmente com Docker

Antes de enviar para a nuvem, você pode rodar e testar o container na sua máquina com o Docker já instalado:

```powershell
# Subir o container localmente na porta 8080
docker compose up -d --build

# Acessar no navegador:
# Painel Web:  http://localhost:8080/
# Painel Admin: http://localhost:8080/admin
```
