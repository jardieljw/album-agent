"""
Main Entrypoint for AI-First Browser Agent.
Supports launching the web server or running CLI investigation on target URLs.
"""

import threading
import webview
import sys
import argparse
import asyncio
import socket
import uvicorn

if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from src.browser.engine import BrowserEngine
from src.browser.tools import BrowserTools
from src.validator.validator import ImageValidator
from src.investigator.investigator import OriginalImageInvestigator
from src.agent.brain import SemanticAgentBrain
from src.agent.llm_adapter import LLMAdapter
from src.observability.debugger import AgentDebugger
from src.server.server import app

def _get_local_ips() -> list[str]:
    """Returns local network IPv4 addresses for mobile access (e.g. iPhone on Wi-Fi)."""
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        primary = s.getsockname()[0]
        s.close()
        if primary and primary != "127.0.0.1":
            ips.append(primary)
    except Exception:
        pass

    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127.") and not ip.startswith("169.254.") and ip not in ips:
                ips.append(ip)
    except Exception:
        pass

    return ips if ips else ["127.0.0.1"]


async def run_cli_investigation(
    url: str,
    headless: bool = True,
    llm_base: str = "http://localhost:11434/v1",
    model_name: str = "qwen2.5:32b",
):
    """Runs investigation on a single URL and prints structured report to console."""
    print(f"\n[AI-Agent] Starting investigation on: {url} (Model: {model_name})")
    engine = BrowserEngine(headless=headless, max_concurrent_tabs=3)
    await engine.start()

    try:
        tools = BrowserTools(engine=engine)
        validator = ImageValidator()
        investigator = OriginalImageInvestigator(tools=tools, validator=validator)
        llm = LLMAdapter(api_base=llm_base, model_name=model_name)
        await llm.check_availability()

        brain = SemanticAgentBrain(
            engine=engine,
            tools=tools,
            validator=validator,
            investigator=investigator,
            llm_adapter=llm,
        )

        album = await brain.run(url)
        report = AgentDebugger.format_console_report(album)
        print("\n" + report)
    finally:
        await engine.close()


def main():
    parser = argparse.ArgumentParser(description="AI-First Browser Agent for Album Discovery")
    parser.add_argument("url", nargs="?", help="Target gallery or forum URL to investigate")
    parser.add_argument("--server", action="store_true", help="Launch FastAPI Web UI server")
    import os
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)), help="Port for web server (default 8000 or $PORT)")
    parser.add_argument("--host", type=str, default=os.environ.get("HOST", "0.0.0.0"), help="Host for web server (default 0.0.0.0)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload on code change")
    parser.add_argument("--headed", action="store_true", help="Run browser in visible headed mode")
    parser.add_argument("--model", type=str, default="qwen2.5:32b", help="Model name (default: qwen2.5:32b)")
    parser.add_argument("--llm-base", type=str, default="http://localhost:11434/v1", help="Local LLM API base URL")

    args = parser.parse_args()

    if args.server or not args.url:
        local_ips = _get_local_ips()
        print("\n" + "=" * 65)
        print(" AI-First Browser Agent Server Running")
        print(f" Computador Local: http://localhost:{args.port}")
        for ip in local_ips:
            print(f" iPhone / Wi-Fi:   http://{ip}:{args.port}")
        print(f" Default Model:    {args.model}")
        print(f" Mock Tests:       http://localhost:{args.port}/mock/gallery/album-1")
        print("=" * 65 + "\n")

        server_thread = threading.Thread(
            target=uvicorn.run,
            args=(app,),
            kwargs={"host": args.host, "port": args.port, "loop": "asyncio"},
            daemon=True  # Fecha o servidor assim que a janela principal for fechada
        )
        server_thread.start()

        # Cria e abre a janela do aplicativo nativo
        webview.create_window(
            title="Extrator de Mídia",
            url=f"http://127.0.0.1:{args.port}",
            width=1280,
            height=800,
            resizable=True
        )
        webview.start()


    else:
        asyncio.run(run_cli_investigation(
            url=args.url,
            headless=not args.headed,
            llm_base=args.llm_base,
            model_name=args.model,
        ))


if __name__ == "__main__":
    main()
