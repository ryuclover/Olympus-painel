import os
import sys
import platform
import socket
import urllib.request
import subprocess
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

def test_google_maps():
    try:
        url = "https://www.google.com/maps/search/clinica+medica"
        req = urllib.request.Request(url, headers={"User-Agent": "OlympusPainel/2.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.getcode() == 200:
                return "OK: Google Maps acessível"
            else:
                return f"ERRO: Google Maps retornou HTTP {resp.getcode()}"
    except Exception as e:
        return f"ERRO: Google Maps inacessível: {str(e)}"

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

def check_python_libs():
    libs = ['requests', 'playwright']
    missing = []
    for lib in libs:
        try:
            __import__(lib)
        except ImportError:
            missing.append(lib)
    
    if missing:
        return f"FALTA: Bibliotecas Python não encontradas: {', '.join(missing)}"
    else:
        return "OK: Todas bibliotecas Python essenciais estão instaladas"

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

    print(test_google_maps())

    print_step("Permissões de Pasta (Dados)")
    print(check_appdata())

    print_step("Bibliotecas Python")
    print(check_python_libs())

    print("\n" + "="*52)
    print(" Diagnóstico Concluído. Copie este log e envie ao suporte.")
    print("="*52)
    input("\nPressione ENTER para fechar...")

if __name__ == "__main__":
    run_diagnostic()
