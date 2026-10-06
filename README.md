# ⚡ IMAGEX.AI v4.2

Plataforma autônoma para extração, organização e inspeção inteligente de álbuns e vídeos da Web em resolução máxima original. 🚀✨

---

## 🚀 Como Iniciar o App e o Servidor

### 1. Modo Desktop Nativo (Janela pywebview) 🖥️
Abre o servidor em segundo plano e exibe a janela nativa do aplicativo:
```powershell
python -m src.main

```

---

### 2. Modo Servidor Web Local (Apenas Navegador) 🌐

Inicia exclusivamente o backend FastAPI sem abrir nenhuma janela na tela (ideal para acessar pelo Chrome/Edge ou por outros dispositivos como celular na rede local):

```powershell
python -m src.main --server --port 8000

```

> 📱 **Acesso no navegador:**
> * **No PC local:** `http://localhost:8000`
> * **No Celular/Wi-Fi:** `http://<SEU_IP_LOCAL>:8000`
> 
> 

---

### 3. Modo CLI Direto (Investigação por Linha de Comando) 🕵️‍♂️

Executa a investigação autônoma diretamente para uma URL específica pelo terminal:

```powershell
python -m src.main "[https://exemplo.com/galeria](https://exemplo.com/galeria)" --headed

```

---

### 4. Executável Portátil (Sem precisar de Python) 📦

1. Baixe o arquivo `IMAGEX.AI-v4.2-Windows.zip` na aba de **Releases** do GitHub.
2. Extraia a pasta em qualquer lugar do Windows.
3. Dê dois cliques em `main.exe` para rodar.

---

## 🛠️ Como Instalar e Rodar pelo Código-Fonte

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

## ⚙️ Como Compilar o Executável (.exe) 🔨

Para compilar o frontend com Vite e empacotar tudo no `dist/main.exe`:

1. Basta dar dois cliques no script **`compilar_executavel.bat`** na raiz do projeto.
2. O script vai automaticamente:
* Rodar o build do frontend (`npm run build`).
* Verificar o Chromium do Playwright.
* Gerar o executável único portátil via PyInstaller na pasta `dist/`.



---

## 📂 Estrutura de Pastas e Mídias 📁

Todas as mídias e dados baixados são persistidos dinamicamente na raiz:

* 📁 `data/albums/` — Galerias e imagens baixadas em alta resolução.
* 📁 `data/videos/` — Vídeos capturados pelo extrator.
* 📁 `data/trash/` — Lixeira e mídias descartadas.

```

```