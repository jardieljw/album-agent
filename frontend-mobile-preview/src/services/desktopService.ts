/**
 * Desktop Platform Service (PyWebView Integration)
 *
 * Princípio Aberto/Fechado (OCP - SOLID):
 * Isola completamente a comunicação nativa com o executável Windows (.exe).
 * - No Google Chrome ou qualquer navegador padrão: 'isDesktopApp()' retorna false e
 *   'setDesktopFullscreen' não realiza nenhuma operação, garantindo que o comportamento
 *   original do Chrome (HTML5 requestFullscreen puro cobrindo a tela da foto) permaneça 100% intacto.
 * - No executável Windows (.exe / PyWebView): interage com a janela nativa do Windows Forms/WebView2,
 *   trazendo a janela física para tela cheia sem bordas (borderless fullscreen) cobrindo 100% do monitor,
 *   escondendo a barra de títulos do Windows e a barra de tarefas.
 */

if (typeof window !== 'undefined') {
  window.addEventListener('pywebviewready', () => {
    (window as any).__pywebview_ready__ = true;
  });
}

export const isDesktopApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).pywebview || (window as any).__pywebview_ready__);
};

export const setDesktopFullscreen = async (fullscreen: boolean): Promise<boolean> => {
  if (!isDesktopApp()) return false;

  try {
    const pyApi = (window as any).pywebview?.api;
    if (pyApi && typeof pyApi.set_fullscreen === 'function') {
      const res = await pyApi.set_fullscreen(fullscreen);
      return Boolean(res);
    }
  } catch (err) {
    console.warn('[desktopService] Falha ao sincronizar tela cheia nativa do desktop:', err);
  }
  return false;
};

export const toggleDesktopFullscreen = async (): Promise<boolean> => {
  if (!isDesktopApp()) return false;

  try {
    const pyApi = (window as any).pywebview?.api;
    if (pyApi && typeof pyApi.toggle_fullscreen === 'function') {
      const res = await pyApi.toggle_fullscreen();
      return Boolean(res);
    }
  } catch (err) {
    console.warn('[desktopService] Falha ao alternar tela cheia nativa do desktop:', err);
  }
  return false;
};

export const restoreDesktopWindow = async (): Promise<boolean> => {
  if (!isDesktopApp()) return false;

  try {
    const pyApi = (window as any).pywebview?.api;
    if (pyApi) {
      if (typeof pyApi.restore_window === 'function') {
        await pyApi.restore_window();
      } else if (typeof pyApi.set_fullscreen === 'function') {
        await pyApi.set_fullscreen(false);
      }
      return true;
    }
  } catch (err) {
    console.warn('[desktopService] Falha ao restaurar janela normal:', err);
  }
  return false;
};

/**
 * Alternador Universal de Tela Cheia (100% livre de conflitos e cliques duplos)
 * - No Desktop (.exe): controla exclusivamente a janela nativa física do Windows (evitando loops e bloqueios no WebView2).
 * - No Navegador (Chrome/Edge): executa HTML5 requestFullscreen de forma pura e fluida.
 */
export const toggleAppFullscreen = async (
  currentIsFullscreen: boolean,
  setFullscreenState: (fs: boolean) => void
): Promise<boolean> => {
  const next = !currentIsFullscreen;
  setFullscreenState(next);

  // 1. No app Desktop (.exe / PyWebView), controla a janela nativa do Windows
  if (isDesktopApp()) {
    try {
      await setDesktopFullscreen(next);
    } catch (err) {
      console.warn('[toggleAppFullscreen] Erro ao alternar tela cheia no desktop:', err);
    }
    return next;
  }

  // 2. No Navegador Web puro (Chrome / Edge), executa HTML5 Fullscreen API
  try {
    if (next) {
      const el = document.documentElement as any;
      const req = el?.requestFullscreen || el?.webkitRequestFullscreen || el?.msRequestFullscreen;
      if (req && !document.fullscreenElement) {
        await req.call(el);
      }
    } else {
      const doc = document as any;
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
      if (exit && (document.fullscreenElement || (document as any).webkitFullscreenElement)) {
        await exit.call(doc);
      }
    }
  } catch (err) {
    console.warn('[toggleAppFullscreen] HTML5 requestFullscreen:', err);
  }

  return next;
};

/**
 * Garante saída total do modo tela cheia ao fechar qualquer visualizador
 */
export const exitAllFullscreen = async (
  setFullscreenState?: (fs: boolean) => void
): Promise<void> => {
  if (setFullscreenState) {
    setFullscreenState(false);
  }

  if (isDesktopApp()) {
    try {
      await restoreDesktopWindow();
    } catch (_) {}
    return;
  }

  try {
    const doc = document as any;
    const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
    if (exit && (document.fullscreenElement || (document as any).webkitFullscreenElement)) {
      await exit.call(doc);
    }
  } catch (_) {}
};
