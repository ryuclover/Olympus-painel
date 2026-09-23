import os
import tarfile
import time
from pathlib import Path
from daytona import Daytona, DaytonaConfig

API_KEY = "dtn_2cfe2bb0ca3d89ccd530e5c974e670f56717a51bd24eff153bed930d00a27430"
SANDBOX_ID = "0bec384d-90e5-4f00-89c1-176e5ddab184"
BASE_DIR = Path(__file__).resolve().parent.parent

def criar_bundle():
    bundle_path = BASE_DIR / "olympus_deploy.tar.gz"
    print(f"[*] Criando arquivo compactado para envio: {bundle_path.name}...")
    
    with tarfile.open(bundle_path, "w:gz") as tar:
        # 1. Adiciona backend
        backend_dir = BASE_DIR / "backend"
        for root, dirs, files in os.walk(backend_dir):
            dirs[:] = [d for d in dirs if d not in ["__pycache__", ".venv", "venv", ".git", "_tmp_scraper", "uploads"]]
            for file in files:
                if file.endswith((".pyc", ".csv", ".db-wal", ".db-shm")):
                    continue
                full_path = Path(root) / file
                rel_path = full_path.relative_to(BASE_DIR)
                tar.add(full_path, arcname=str(rel_path).replace("\\", "/"))
        
        # 2. Adiciona dist (Painel Web)
        dist_dir = BASE_DIR / "dist"
        if dist_dir.exists():
            for root, dirs, files in os.walk(dist_dir):
                for file in files:
                    full_path = Path(root) / file
                    rel_path = full_path.relative_to(BASE_DIR)
                    tar.add(full_path, arcname=str(rel_path).replace("\\", "/"))

        # 3. Adiciona olympus-admin/dist (Admin Web)
        admin_dist_dir = BASE_DIR / "olympus-admin" / "dist"
        if admin_dist_dir.exists():
            for root, dirs, files in os.walk(admin_dist_dir):
                for file in files:
                    full_path = Path(root) / file
                    rel_path = full_path.relative_to(BASE_DIR)
                    tar.add(full_path, arcname=str(rel_path).replace("\\", "/"))

    size_mb = bundle_path.stat().st_size / (1024 * 1024)
    print(f"[OK] Bundle criado com sucesso ({size_mb:.2f} MB)")
    return bundle_path

def main():
    print("[1/5] Conectando ao Daytona Cloud...")
    client = Daytona(DaytonaConfig(api_key=API_KEY))
    sandbox = client.get(SANDBOX_ID)
    print(f"[OK] Conectado à Sandbox: {sandbox.id} (Status: {sandbox.state})")

    # 1. Criar bundle
    bundle_path = criar_bundle()

    # 2. Upload para a Sandbox
    print("[2/5] Enviando arquivos para a Sandbox Daytona...")
    remote_archive = "/home/daytona/olympus_deploy.tar.gz"
    sandbox.fs.upload_file(str(bundle_path), remote_archive)
    print("[OK] Upload concluído!")

    # 3. Descompactar na Sandbox
    print("[3/5] Descompactando e preparando diretórios...")
    cmd_extract = "mkdir -p /home/daytona/olympus && tar -xzf /home/daytona/olympus_deploy.tar.gz -C /home/daytona/olympus"
    res = sandbox.process.exec(cmd_extract)
    print("Extração:", res.result.strip() if res.result else "OK")

    # 4. Instalar dependências Python na Sandbox
    print("[4/5] Instalando dependências no Linux da Sandbox...")
    cmd_deps = "cd /home/daytona/olympus/backend && pip install --no-cache-dir flask flask-cors waitress requests python-dotenv fpdf2"
    res_deps = sandbox.process.exec(cmd_deps)
    print("Dependências:", res_deps.result[-300:] if res_deps.result else "OK")

    # 5. Iniciar servidor na porta 8080 em background
    print("[5/5] Iniciando o servidor Olympus na porta 8080...")
    # Mata qualquer processo anterior na porta 8080 se houver
    sandbox.process.exec("fuser -k 8080/tcp || true")
    cmd_start = "cd /home/daytona/olympus/backend && PORT=8080 nohup python3 app.py > server.log 2>&1 &"
    sandbox.process.exec(cmd_start)
    time.sleep(3)

    # Checa logs do servidor
    log_check = sandbox.process.exec("tail -n 10 /home/daytona/olympus/backend/server.log")
    print("\n--- LOGS DO SERVIDOR NA SANDBOX ---")
    print(log_check.result)
    print("-----------------------------------")

    # 6. Obter Preview Link
    print("\n[*] Gerando link público de acesso...")
    try:
        preview = sandbox.get_preview_link(8080)
        print(f"\n[SUCESSO] Link de Acesso do Daytona (Porta 8080): {preview.url}")
        if hasattr(preview, "token") and preview.token:
            print(f"Token de Autenticação (se privado): {preview.token}")
    except Exception as e:
        print(f"Aviso ao buscar preview_link: {e}")

    # Remove bundle local
    if bundle_path.exists():
        bundle_path.unlink()

if __name__ == "__main__":
    main()
