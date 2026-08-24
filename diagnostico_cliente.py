import os
import sys
import platform
import subprocess
import socket
from pathlib import Path

def print_step(msg):
    print(f"\n=== {msg} ===")

def test_network(host="8.8.8.8", port=53, timeout=3):
    try:
        socket.setdefaulttimeout(timeout)
        socket.socket(socket.AF_INET, socket.SOCK_STREAM).connect((host, port))
        return True
    except socket.error:
        return False

def check_appdata():
    appdata = os.environ.get('APPDATA')
    if not appdata:
        return "ERRO: Variável APPDATA não encontrada"
    
    path = Path(appdata) / "OlympusPainel"
    try:
        path.mkdir(parents=True, exist_ok=True)
        test_file = path / "test_write.txt"
        test_file.write_text("teste de escrita ok", encoding="utf-8")
        test_file.unlink()
        return f"OK: {path} (Escrita permitida)"
    except Exception as e:
        return f"ERRO ao acessar {path}: {str(e)}"

def check_playwright():
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto("https://www.google.com", timeout=10000)
            title = page.title()
            browser.close()
            return f"OK: Navegador abriu e carregou o Google ('{title}')"
    except Exception as e:
        return f"FALHA: O navegador interno não pôde ser iniciado: {str(e)}"

def run_diagnostic():
    print("====================================================")
    print("      DIAGNÓSTICO TÉCNICO - OLYMPUS PAINEL          ")
    print("====================================================\n")

    print_step("Informações do Sistema")
    print(f"OS: {platform.system()} {platform.release()} ({platform.architecture()[0]})")
    print(f"Python: {sys.version}")
    print(f"Diretório Atual: {os.getcwd()}")

    print_step("Teste de Rede")
    if test_network():
        print("Conectividade Internet: OK")
    else:
        print("Conectividade Internet: FALHA (Verifique seu firewall)")

    if test_network("google.com", 443):
        print("Acesso ao Google: OK")
    else:
        print("Acesso ao Google: BLOQUEADO (Pode ser o motivo da busca falhar)")

    print_step("Permissões de Pasta (Dados)")
    print(check_appdata())

    print_step("Teste de Navegador (Playwright)")
    print("Aguarde, testando abertura do Chromium...")
    print(check_playwright())

    print("\n" + "="*52)
    print(" Diagnóstico Concluído. Copie este log e envie ao suporte.")
    print("="*52)
    input("\nPressione ENTER para fechar...")

if __name__ == "__main__":
    run_diagnostic()
