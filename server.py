import http.server
import socketserver
import os
import sys
import datetime

# --- KONFIGURACE ---
PORT = 8082
# Cesta z původního .bat souboru
PROJECT_DIR = r"C:\Users\jirme\Desktop\projekty\claude-export-viewer\claude-export-viewer-rozdelen"

# Barvy pro konzoli (ANSI escape kody)
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

# --- LOGIKA SERVERU ---
class StarTrekHandler(http.server.SimpleHTTPRequestHandler):
    
    # Přidání CORS a Cache hlaviček (kritické pro moduly a audio)
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    # Vlastní formátování logu (podle tvého vzoru)
    def log_message(self, format, *args):
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        message = format % args
        
        color = Colors.CYAN
        if "404" in message:
            color = Colors.FAIL
        elif ".mp3" in message or ".wav" in message:
            color = Colors.WARNING # Zlatá pro audio
        elif ".js" in message or ".css" in message:
            color = Colors.BLUE
            
        print(f"{Colors.GREEN}[{timestamp}]{Colors.ENDC} {color}{message}{Colors.ENDC}")

# --- START SERVERU ---
def run_server():
    # Nastavení kódování konzole pro Windows
    if sys.platform == "win32":
        os.system('color')
        os.system('chcp 65001 >nul')

    print(f"{Colors.BOLD}{Colors.CYAN}")
    print("=" * 55)
    print("   STAR TREK LOCAL SERVER v3.0 (Python Edition)")
    print("   Více admirál Jiřík & Admirál Claude.AI")
    print("=" * 55)
    print(f"{Colors.ENDC}")

    # Kontrola a změna adresáře
    if os.path.exists(PROJECT_DIR):
        os.chdir(PROJECT_DIR)
        print(f"📂 Pracovní adresář nastaven: {Colors.GREEN}OK{Colors.ENDC}")
    else:
        print(f"{Colors.FAIL}CHYBA: Adresář nenalezen!{Colors.ENDC}")
        print(f"Hledáno: {PROJECT_DIR}")
        print("Spouštím v aktuálním adresáři...")

    # Kontrola index.html
    if not os.path.exists("index.html"):
        print(f"{Colors.FAIL}VAROVÁNÍ: index.html v adresáři chybí!{Colors.ENDC}")

    print(f"🚀 Warp jádro aktivní na: {Colors.BOLD}http://localhost:{PORT}{Colors.ENDC}")
    print(f"📡 Audio Streaming & CORS: {Colors.GREEN}ENABLED{Colors.ENDC}")
    print("-" * 55)

    try:
        # Povolení reuse address, aby neblokoval port při restartu
        socketserver.TCPServer.allow_reuse_address = True
        with socketserver.TCPServer(("", PORT), StarTrekHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print(f"\n{Colors.WARNING}🛑 Server zastaven (Warp Core Shutdown).{Colors.ENDC}")
        sys.exit(0)

if __name__ == "__main__":
    run_server()