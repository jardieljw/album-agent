# ⚡ IMAGEX.AI v4.2

Autonomous platform for intelligent extraction, organization, and inspection of web albums and videos in their original maximum resolution. 🚀✨

---

## 🌐 English Guide

### 🚀 How to Start the App and Server

#### 1. Native Desktop Mode (pywebview Window) 🖥️
Starts the background server and opens the native application window:
```powershell
python -m src.main
```

---

#### 2. Local Web Server Mode (Browser Only) 🌐
Runs exclusively the FastAPI backend without opening a native window (ideal for accessing via Chrome/Edge or from mobile devices on your local Wi-Fi):

```powershell
python -m src.main --server --port 8000
```

> 📱 **Browser Access:**
> * **On local PC:** `http://localhost:8000`
> * **On Mobile / Local Network:** `http://<YOUR_LOCAL_IP>:8000`

---

#### 3. Direct CLI Mode (Command Line Investigation) 🕵️‍♂️
Runs autonomous investigation directly for a specific URL via the terminal:

```powershell
python -m src.main "https://example.com/gallery" --headed
```

---

#### 4. Portable Executable (No Python Required) 📦
1. Download `IMAGEX.AI-v4.2-Windows.zip` from the GitHub **Releases** tab.
2. Extract the archive anywhere on Windows.
3. Double-click `main.exe` to run.

---

### 🛠️ Installation & Setup from Source

If setting up the project from scratch:

```powershell
# 1. Create and activate a virtual environment
python -m venv venv
.\venv\Scripts\activate

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Install Playwright Chromium browser
python -m playwright install chromium

# 4. Start the application
python -m src.main
```

---

### ⚙️ How to Build the Executable (.exe) 🔨

To compile the frontend with Vite and package everything into `dist/main.exe`:

1. Simply double-click the **`compilar_executavel.bat`** script in the project root.
2. The script will automatically:
   * Build the frontend (`npm run build`).
   * Verify Playwright Chromium dependencies.
   * Generate the standalone portable executable via PyInstaller in the `dist/` directory.

---

### 📂 Directory & Media Structure 📁

All downloaded media and metadata are dynamically persisted in the project root:

* 📁 `data/albums/` — Downloaded high-resolution galleries and images.
* 📁 `data/videos/` — Video media captured by the extractor.
* 📁 `data/trash/` — Recycled and discarded media items.

<br>

---

## 🇧🇷 Guia em Português

### 🚀 Como Iniciar o App e o Servidor

#### 1. Modo Desktop Nativo (Janela pywebview) 🖥️
Abre o servidor em segundo plano e exibe a janela nativa do aplicativo:
```powershell
python -m src.main
```

---

#### 2. Modo Servidor Web Local (Apenas Navegador) 🌐
Inicia exclusivamente o backend FastAPI sem abrir nenhuma janela na tela (ideal para acessar pelo Chrome/Edge ou por outros dispositivos como celular na rede local):

```powershell
python -m src.main --server --port 8000
```

> 📱 **Acesso no navegador:**
> * **No PC local:** `http://localhost:8000`
> * **No Celular/Wi-Fi:** `http://<SEU_IP_LOCAL>:8000`

---

#### 3. Modo CLI Direto (Investigação por Linha de Comando) 🕵️‍♂️
Executa a investigação autônoma diretamente para uma URL específica pelo terminal:

```powershell
python -m src.main "https://exemplo.com/galeria" --headed
```

---

#### 4. Executável Portátil (Sem precisar de Python) 📦
1. Baixe o arquivo `IMAGEX.AI-v4.2-Windows.zip` na aba de **Releases** do GitHub.
2. Extraia a pasta em qualquer lugar do Windows.
3. Dê dois cliques em `main.exe` para rodar.

---

### 🛠️ Como Instalar e Rodar pelo Código-Fonte

Caso esteja configurando o projeto do zero:

```powershell
# 1. Criar e ativar o ambiente virtual
python -m venv venv
.\venv\Scripts\activate

# 2. Instalar dependências Python
pip install -r requirements.txt

# 3. Instalar o navegador Chromium do Playwright
python -m playwright install chromium

# 4. Iniciar a aplicação
python -m src.main
```

---

### ⚙️ Como Compilar o Executável (.exe) 🔨

Para compilar o frontend com Vite e empacotar tudo no `dist/main.exe`:

1. Basta dar dois cliques no script **`compilar_executavel.bat`** na raiz do projeto.
2. O script vai automaticamente:
   * Rodar o build do frontend (`npm run build`).
   * Verificar o Chromium do Playwright.
   * Gerar o executável único portátil via PyInstaller na pasta `dist/`.

---

### 📂 Estrutura de Pastas e Mídias 📁

Todas as mídias e dados baixados são persistidos dinamicamente na raiz:

* 📁 `data/albums/` — Galerias e imagens baixadas em alta resolução.
* 📁 `data/videos/` — Vídeos capturados pelo extrator.
* 📁 `data/trash/` — Lixeira e mídias descartadas.