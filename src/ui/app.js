/**
 * Frontend Application for AI-First Browser Agent.
 * Features:
 * - True Concurrent Multi-URL Batch Extraction Manager
 * - Distinct, Separated Multi-Album Exhibition & Navigation Tabs
 * - Windows Explorer-Style View & Sort Controls per Album Card & Saved Library
 * - Untouched Original Raw Title Preservation (No unwanted translations)
 * - Teach AI Mode with Ground-Truth 4K URL input for Qwen Pattern Induction
 * - Rename & Delete Modals (preserving raw original titles)
 * - Single image, Full ZIP, and JSON Downloads
 */

document.addEventListener("DOMContentLoaded", () => {
    // Mode Navigation
    const tabMode1 = document.getElementById("tabMode1");
    const tabMode2 = document.getElementById("tabMode2");
    const tabLibrary = document.getElementById("tabLibrary");
    const panelMode1 = document.getElementById("panelMode1");
    const panelMode2 = document.getElementById("panelMode2");
    const panelLibrary = document.getElementById("panelLibrary");
    const savedAlbumsCount = document.getElementById("savedAlbumsCount");

    // Background Jobs Banner
    const activeJobsBanner = document.getElementById("activeJobsBanner");
    const activeJobsCount = document.getElementById("activeJobsCount");
    const activeJobsList = document.getElementById("activeJobsList");
    const btnStopCurrentJob = document.getElementById("btnStopCurrentJob");

    // Mode 1 Elements
    const analyzeForm = document.getElementById("analyzeForm");
    const targetUrlInput = document.getElementById("targetUrl");
    const submitBtn = document.getElementById("submitBtn");
    const btnToggleBatchMode = document.getElementById("btnToggleBatchMode");
    const singleUrlWrapper = document.getElementById("singleUrlWrapper");
    const batchUrlWrapper = document.getElementById("batchUrlWrapper");
    const batchUrlsInput = document.getElementById("batchUrlsInput");
    const btnBatchSubmit = document.getElementById("btnBatchSubmit");

    // Mode 2 Elements
    const teachUrl = document.getElementById("teachUrl");
    const scanBtn = document.getElementById("scanBtn");
    const teachSubmitBtn = document.getElementById("teachSubmitBtn");
    const candidatePickerGrid = document.getElementById("candidatePickerGrid");
    const countPos = document.getElementById("countPos");
    const countNeg = document.getElementById("countNeg");
    const countGroundTruth = document.getElementById("countGroundTruth");

    // Mode 2 Batch Elements
    const btnSelectAll = document.getElementById("btnSelectAll");
    const btnDeselectAll = document.getElementById("btnDeselectAll");
    const btnInvertSelection = document.getElementById("btnInvertSelection");
    const btnSelectSameContainer = document.getElementById("btnSelectSameContainer");
    const batchSelectedCount = document.getElementById("batchSelectedCount");
    const btnBatchMarkPos = document.getElementById("btnBatchMarkPos");
    const btnBatchMarkNeg = document.getElementById("btnBatchMarkNeg");

    // Windows Explorer Library Elements
    const librarySearchInput = document.getElementById("librarySearchInput");
    const libraryStatusFilter = document.getElementById("libraryStatusFilter");
    const explorerSortBy = document.getElementById("explorerSortBy");
    const btnSortOrder = document.getElementById("btnSortOrder");
    const sortOrderIcon = document.getElementById("sortOrderIcon");
    const sortOrderLabel = document.getElementById("sortOrderLabel");
    const explorerViewMode = document.getElementById("explorerViewMode");
    const libraryContainer = document.getElementById("libraryContainer");

    // Album Presentation Elements
    const emptyState = document.getElementById("emptyState");
    const multiAlbumNav = document.getElementById("multiAlbumNav");
    const multiAlbumTabs = document.getElementById("multiAlbumTabs");
    const albumsContainer = document.getElementById("albumsContainer");

    // Common Elements
    const engineStatus = document.getElementById("engineStatus");
    const modelSelect = document.getElementById("modelSelect");

    // Telemetry Elements
    const mAiActions = document.getElementById("mAiActions");
    const mBrowserActions = document.getElementById("mBrowserActions");
    const mDiscovered = document.getElementById("mDiscovered");
    const mInvestigated = document.getElementById("mInvestigated");
    const mResolved = document.getElementById("mResolved");
    const mUnresolved = document.getElementById("mUnresolved");
    const mBanners = document.getElementById("mBanners");
    const mRelated = document.getElementById("mRelated");

    // Observability & Live Terminal Elements
    const liveTerminalConsole = document.getElementById("liveTerminalConsole");
    const terminalLiveLed = document.getElementById("terminalLiveLed");
    const terminalLiveStatus = document.getElementById("terminalLiveStatus");
    const btnCopyTerminalLogs = document.getElementById("btnCopyTerminalLogs");
    const btnClearTerminalLogs = document.getElementById("btnClearTerminalLogs");
    const btnToggleAutoScroll = document.getElementById("btnToggleAutoScroll");
    const countLogsAll = document.getElementById("countLogsAll");
    const auditList = document.getElementById("auditList");
    const auditCountBadge = document.getElementById("auditCountBadge");
    const learningEventBox = document.getElementById("learningEventBox");
    const learningEventSummary = document.getElementById("learningEventSummary");
    const learningEventList = document.getElementById("learningEventList");
    let autoScrollEnabled = true;
    let currentTerminalFilter = "all";
    const terminalLogsHistory = [];

    // Image Modal Elements
    const imageModal = document.getElementById("imageModal");
    const modalImage = document.getElementById("modalImage");
    const modalMeta = document.getElementById("modalMeta");
    const modalClose = document.getElementById("modalClose");
    const modalOverlay = document.getElementById("modalOverlay");

    // Rename Modal Elements
    const renameModal = document.getElementById("renameModal");
    const renameModalOverlay = document.getElementById("renameModalOverlay");
    const renameTitleInput = document.getElementById("renameTitleInput");
    const btnCancelRename = document.getElementById("btnCancelRename");
    const btnConfirmRename = document.getElementById("btnConfirmRename");

    // Delete Modal Elements
    const deleteModal = document.getElementById("deleteModal");
    const deleteModalOverlay = document.getElementById("deleteModalOverlay");
    const deleteAlbumFilename = document.getElementById("deleteAlbumFilename");
    const btnCancelDelete = document.getElementById("btnCancelDelete");
    const btnConfirmDelete = document.getElementById("btnConfirmDelete");

    // App State
    let currentProcessedCount = 0;
    let scannedCandidates = [];
    let positiveIds = new Set();
    let negativeIds = new Set();
    let groundTruthMap = new Map(); // candidate_id -> 4K URL
    let selectedForBatch = new Set();
    let lastClickedCandidateIndex = -1;
    let currentActiveSessionId = null;
    let allSavedAlbums = [];
    let sortDirection = "desc"; // 'asc' or 'desc'
    let targetAlbumForRename = null;
    let targetAlbumForDelete = null;

    // Multi-Album Sessions State: Map<sessionId, SessionData>
    const activeSessions = new Map();
    let currentSelectedTabSession = "all";

    // Helper: Generate Image Proxy URL to bypass CORS and Hotlink restrictions
    function getProxyUrl(src, referer) {
        if (!src) return "";
        if (src.startsWith("data:") || src.startsWith("blob:")) return src;
        return `/api/proxy-image?url=${encodeURIComponent(src)}&referer=${encodeURIComponent(referer || window.location.href)}`;
    }

    // Tab Navigation
    function switchTab(activeTab, activePanel) {
        [tabMode1, tabMode2, tabLibrary].forEach(t => t.classList.remove("active"));
        [panelMode1, panelMode2, panelLibrary].forEach(p => p.classList.add("hidden"));
        activeTab.classList.add("active");
        activePanel.classList.remove("hidden");
    }

    tabMode1.addEventListener("click", () => switchTab(tabMode1, panelMode1));
    tabMode2.addEventListener("click", () => {
        switchTab(tabMode2, panelMode2);
        if (targetUrlInput.value && !teachUrl.value) {
            teachUrl.value = targetUrlInput.value;
        }
    });
    tabLibrary.addEventListener("click", () => {
        switchTab(tabLibrary, panelLibrary);
        fetchAndRenderLibrary();
    });

    // Auto-discover Ollama Models with rich labels
    async function loadAvailableModels() {
        try {
            const res = await fetch("/api/models");
            if (res.ok) {
                const data = await res.json();
                const rawModels = data.models || data.model_details || [];
                if (rawModels.length > 0) {
                    modelSelect.innerHTML = "";
                    rawModels.forEach(m => {
                        const opt = document.createElement("option");
                        const modelName = (typeof m === "object" && m !== null) ? (m.name || "") : String(m);
                        let modelLabel = (typeof m === "object" && m !== null && m.label) ? m.label : modelName;

                        if (!modelName) return;

                        if (typeof m === "string") {
                            if (modelName.includes("32b")) modelLabel += " (High Precision / Recommended)";
                            else if (modelName.includes("14b")) modelLabel += " (Advanced Reasoning)";
                            else if (modelName.includes("8b")) modelLabel += " (Fast Reasoning)";
                            else if (modelName.includes("7b")) modelLabel += " (Fast)";
                        }

                        opt.value = modelName;
                        opt.innerText = modelLabel;

                        if (modelName === data.default || modelName === data.preferred || modelName.includes("32b")) {
                            opt.selected = true;
                        }
                        modelSelect.appendChild(opt);
                    });
                }
            }
        } catch (e) {
            console.log("Using default fallback models", e);
        }
    }
    loadAvailableModels();

    // Toggle Multi-URL Batch Input
    btnToggleBatchMode.addEventListener("click", () => {
        const isBatch = !batchUrlWrapper.classList.contains("hidden");
        if (isBatch) {
            batchUrlWrapper.classList.add("hidden");
            singleUrlWrapper.classList.remove("hidden");
            btnToggleBatchMode.innerText = " Switch to Multi-URL Batch Input";
        } else {
            batchUrlWrapper.classList.remove("hidden");
            singleUrlWrapper.classList.add("hidden");
            btnToggleBatchMode.innerText = " Switch to Single URL Input";
        }
    });

    // Batch Multi-URL Submit (Concurrent background execution)
    btnBatchSubmit.addEventListener("click", async () => {
        const raw = batchUrlsInput.value.trim();
        if (!raw) {
            alert("Please paste at least one URL");
            return;
        }
        const urls = raw.split("\n").map(u => u.trim()).filter(u => u.startsWith("http"));
        if (urls.length === 0) {
            alert("No valid http/https URLs found in text");
            return;
        }

        btnBatchSubmit.disabled = true;
        btnBatchSubmit.innerText = "Starting Concurrent Background Extractions...";

        try {
            const engineRadio = document.querySelector('input[name="engineType"]:checked');
            const selectedEngine = engineRadio ? engineRadio.value : "ai_react";

            const res = await fetch("/api/batch-analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    urls: urls,
                    headless: true,
                    model_name: modelSelect.value,
                    engine_type: selectedEngine,
                })
            });
            if (!res.ok) throw new Error("Failed to start batch extraction");
            const data = await res.json();

            // Clear previous empty state
            emptyState.classList.add("hidden");

            // For each spawned session, register in activeSessions and start SSE stream
            (data.jobs || []).forEach(job => {
                const s = getOrCreateSession(job.session_id, job.url, modelSelect.value);
                listenToSessionEvents(job.session_id, modelSelect.value);
            });

            updateMultiAlbumNav();
            setAgentState("running", `Extracting ${data.total} Albums Concurrently...`);
            btnStopCurrentJob.classList.remove("hidden");
            batchUrlsInput.value = "";
            checkActiveJobs();
        } catch (err) {
            alert("Batch error: " + err.message);
        } finally {
            btnBatchSubmit.disabled = false;
            btnBatchSubmit.innerText = " Extract All URLs Concurrently";
        }
    });

    // -------------------------------------------------------------
    // MULTI-ALBUM SESSION MANAGER & ISOLATED CARD FACTORY
    // -------------------------------------------------------------
    function getOrCreateSession(sessionId, sourceUrl = "", modelName = "Qwen 2.5:32b") {
        if (activeSessions.has(sessionId)) {
            return activeSessions.get(sessionId);
        }

        const session = {
            sessionId: sessionId,
            modelName: modelName,
            url: sourceUrl,
            title: "Discovered Album",
            original_title: "Discovered Album",
            source_page: sourceUrl,
            page_type: "Gallery",
            total_candidates: 0,
            images: [],
            viewMode: "grid-lg",
            sortBy: "position",
            cardEl: createAlbumCardElement(sessionId, sourceUrl, modelName),
            eventSource: null,
        };

        activeSessions.set(sessionId, session);
        updateMultiAlbumNav();
        return session;
    }

    function createAlbumCardElement(sessionId, sourceUrl, modelName) {
        emptyState.classList.add("hidden");

        const card = document.createElement("div");
        card.className = "album-card";
        card.id = `album_card_${sessionId}`;
        card.dataset.sessionId = sessionId;

        card.innerHTML = `
            <div class="album-header-banner">
                <div class="album-meta-info">
                    <div class="album-header-row">
                        <div>
                            <div class="badge-row">
                                <span class="badge badge-source album-source-type">Gallery</span>
                                <span class="badge badge-count album-image-count">0 Images</span>
                                <span class="badge badge-model album-model-badge">${modelName}</span>
                                <span class="badge badge-date album-date-badge">Extracting...</span>
                            </div>
                            <h2 class="album-title">Discovered Album</h2>
                            <p class="album-source-url">${sourceUrl ? `Source: ${sourceUrl}` : 'Investigating DOM...'}</p>
                        </div>
                        <div class="album-download-toolbar">
                            <button type="button" class="btn-rename-album btn-rename-target" title="Rename album title"> Renomear</button>
                            <button type="button" class="btn-download-zip btn-zip-target" title="Download all high-res 4K images packaged in a structured ZIP">⬇ Download Full Album (ZIP)</button>
                            <button type="button" class="btn-export-json btn-json-target" title="Download complete JSON metadata entity"> Export JSON</button>
                            <button type="button" class="btn-delete-album btn-delete-target" title="Delete album permanently from disk"> Excluir</button>
                        </div>
                    </div>
                    <div class="provenance-chain hidden album-provenance"></div>
                </div>

                <!-- Active Gallery Explorer View & Sort Controls -->
                <div class="active-gallery-toolbar">
                    <div class="gallery-controls-left">
                        <span class="gallery-toolbar-label">Exibição:</span>
                        <div class="view-buttons-group">
                            <button type="button" class="btn-view-mode active" data-mode="grid-lg" title="Ícones grandes"> Grandes</button>
                            <button type="button" class="btn-view-mode" data-mode="grid-xl" title="Ícones extra grandes"> Extra Grandes</button>
                            <button type="button" class="btn-view-mode" data-mode="grid-md" title="Ícones médios"> Médios</button>
                            <button type="button" class="btn-view-mode" data-mode="grid-sm" title="Ícones pequenos">⊞ Pequenos</button>
                            <button type="button" class="btn-view-mode" data-mode="list" title="Lista"> Lista</button>
                            <button type="button" class="btn-view-mode" data-mode="details" title="Detalhes">≣ Detalhes</button>
                            <button type="button" class="btn-view-mode" data-mode="tiles" title="Blocos"> Blocos</button>
                        </div>
                    </div>
                    <div class="gallery-controls-right">
                        <label class="gallery-toolbar-label">Ordenar:</label>
                        <select class="gallery-sort-select explorer-select">
                            <option value="position">Ordem Original (#)</option>
                            <option value="resolution">Maior Resolução (4K)</option>
                            <option value="status">Status (Resolvidos primeiro)</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Image Grid / Table -->
            <div class="gallery-grid grid-lg"></div>
        `;

        // Attach action handlers for this isolated card
        const btnZip = card.querySelector(".btn-zip-target");
        const btnJson = card.querySelector(".btn-json-target");
        const btnRename = card.querySelector(".btn-rename-target");
        const btnDel = card.querySelector(".btn-delete-target");
        const sortSelect = card.querySelector(".gallery-sort-select");

        btnZip.onclick = () => window.open(`/api/albums/${sessionId}/download-zip`, "_blank");
        btnJson.onclick = () => window.open(`/api/albums/${sessionId}/export-json`, "_blank");
        btnRename.onclick = () => {
            const session = activeSessions.get(sessionId);
            const curTitle = session ? (session.original_title || session.title) : "Album";
            openRenameModal(sessionId, curTitle);
        };
        btnDel.onclick = () => {
            const session = activeSessions.get(sessionId);
            const curTitle = session ? (session.original_title || session.title) : "Album";
            openDeleteModal(sessionId, curTitle);
        };

        // Explorer view mode buttons for this specific card
        card.querySelectorAll(".btn-view-mode").forEach(b => {
            b.addEventListener("click", () => {
                card.querySelectorAll(".btn-view-mode").forEach(x => x.classList.remove("active"));
                b.classList.add("active");
                const session = activeSessions.get(sessionId);
                if (session) {
                    session.viewMode = b.dataset.mode;
                    renderSessionGallery(session);
                }
            });
        });

        sortSelect.addEventListener("change", (e) => {
            const session = activeSessions.get(sessionId);
            if (session) {
                session.sortBy = e.target.value;
                renderSessionGallery(session);
            }
        });

        albumsContainer.appendChild(card);
        return card;
    }

    function updateMultiAlbumNav() {
        if (activeSessions.size <= 1) {
            multiAlbumNav.classList.add("hidden");
            // Show all cards
            activeSessions.forEach(s => {
                if (s.cardEl) s.cardEl.classList.remove("hidden");
            });
            return;
        }

        multiAlbumNav.classList.remove("hidden");
        multiAlbumTabs.innerHTML = "";

        // "Todos os Álbuns" Tab
        const allTab = document.createElement("button");
        allTab.type = "button";
        allTab.className = `btn-album-tab ${currentSelectedTabSession === 'all' ? 'active' : ''}`;
        allTab.innerHTML = ` Todos os Álbuns (${activeSessions.size})`;
        allTab.addEventListener("click", () => {
            currentSelectedTabSession = "all";
            updateMultiAlbumNav();
            activeSessions.forEach(s => {
                if (s.cardEl) s.cardEl.classList.remove("hidden");
            });
        });
        multiAlbumTabs.appendChild(allTab);

        // Individual Album Tabs
        activeSessions.forEach(session => {
            const tab = document.createElement("button");
            tab.type = "button";
            tab.className = `btn-album-tab ${currentSelectedTabSession === session.sessionId ? 'active' : ''}`;
            const displayTitle = session.original_title || session.title || "Álbum";
            const shortTitle = displayTitle.length > 25 ? displayTitle.slice(0, 22) + "..." : displayTitle;
            tab.innerHTML = ` ${shortTitle} (${session.images.length})`;

            tab.addEventListener("click", () => {
                currentSelectedTabSession = session.sessionId;
                updateMultiAlbumNav();
                activeSessions.forEach(s => {
                    if (s.cardEl) {
                        if (s.sessionId === session.sessionId) {
                            s.cardEl.classList.remove("hidden");
                        } else {
                            s.cardEl.classList.add("hidden");
                        }
                    }
                });
            });

            multiAlbumTabs.appendChild(tab);
        });
    }

    // -------------------------------------------------------------
    // BACKGROUND JOBS MANAGER (Persists across tab closures / mobile)
    // -------------------------------------------------------------
    async function checkActiveJobs() {
        try {
            const res = await fetch("/api/jobs/active");
            if (!res.ok) return;
            const jobs = await res.json();
            const runningJobs = jobs.filter(j => j.status === "running");

            activeJobsCount.innerText = runningJobs.length;
            if (runningJobs.length > 0) {
                activeJobsBanner.classList.remove("hidden");
                activeJobsList.innerHTML = "";
                runningJobs.forEach(job => {
                    const item = document.createElement("div");
                    item.className = "job-item";
                    const curr = job.progress?.current || 0;
                    const tot = job.progress?.total || 0;
                    const progText = tot > 0 ? `${curr} / ${tot} photos` : "Investigating DOM...";
                    const statusText = job.progress?.status || "Running...";
                    const jobTitle = job.progress?.title || job.url;

                    item.innerHTML = `
                        <div class="job-info">
                            <div class="job-url" title="${job.url}"> ${jobTitle}</div>
                            <div class="job-status-line"> ${job.model} — ${progText} | ${statusText}</div>
                        </div>
                        <div class="job-actions">
                            <button type="button" class="btn-job-stop" data-id="${job.session_id}">⏹ Stop</button>
                        </div>
                    `;

                    item.querySelector(".btn-job-stop").addEventListener("click", (e) => {
                        e.stopPropagation();
                        cancelJob(job.session_id);
                    });

                    item.addEventListener("click", () => {
                        getOrCreateSession(job.session_id, job.url, job.model);
                        listenToSessionEvents(job.session_id, job.model);
                    });

                    activeJobsList.appendChild(item);

                    // If not yet listening, start listener
                    if (!activeSessions.has(job.session_id) || !activeSessions.get(job.session_id).eventSource) {
                        getOrCreateSession(job.session_id, job.url, job.model);
                        listenToSessionEvents(job.session_id, job.model);
                    }
                });
            } else {
                activeJobsBanner.classList.add("hidden");
                btnStopCurrentJob.classList.add("hidden");
            }
            updateLibraryBadge();
        } catch (e) {}
    }

    async function cancelJob(sessionId) {
        if (!confirm("Are you sure you want to stop this extraction?")) return;
        try {
            await fetch(`/api/jobs/${sessionId}/cancel`, { method: "POST" });
            checkActiveJobs();
            setAgentState("ready", "Extraction stopped by user");
        } catch (e) {
            alert("Error stopping job: " + e.message);
        }
    }

    btnStopCurrentJob.addEventListener("click", () => {
        if (currentActiveSessionId) {
            cancelJob(currentActiveSessionId);
        } else if (activeSessions.size > 0) {
            const firstId = Array.from(activeSessions.keys())[0];
            cancelJob(firstId);
        }
    });

    // Start background job polling
    checkActiveJobs();
    setInterval(checkActiveJobs, 3500);

    // Quick Test Chips
    document.querySelectorAll(".chip").forEach(chip => {
        chip.addEventListener("click", () => {
            let path = chip.getAttribute("data-url");
            let fullUrl = window.location.origin + path;
            targetUrlInput.value = fullUrl;
            teachUrl.value = fullUrl;
            analyzeForm.dispatchEvent(new Event("submit"));
        });
    });

    // Engine Radio Buttons selection handler (Mode 1 & Mode 2)
    document.querySelectorAll('input[name="engineType"]').forEach(radio => {
        radio.addEventListener("change", () => {
            document.querySelectorAll("#panelMode1 .engine-radio-btn").forEach(l => l.classList.remove("active"));
            const parentLabel = radio.closest(".engine-radio-btn");
            if (parentLabel) parentLabel.classList.add("active");
        });
    });

    document.querySelectorAll('input[name="teachEngineType"]').forEach(radio => {
        radio.addEventListener("change", () => {
            document.querySelectorAll("#panelMode2 .engine-radio-btn").forEach(l => l.classList.remove("active"));
            const parentLabel = radio.closest(".engine-radio-btn");
            if (parentLabel) parentLabel.classList.add("active");
        });
    });

    // -------------------------------------------------------------
    // MODE 1: Autonomous Analysis Submit (Single URL)
    // -------------------------------------------------------------
    analyzeForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        let url = targetUrlInput.value.trim();
        if (!url) {
            alert("Por favor, digite ou cole a URL do álbum ou galeria que deseja extrair.");
            targetUrlInput.focus();
            return;
        }

        if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("/")) {
            url = "https://" + url;
            targetUrlInput.value = url;
        }

        const selectedModel = modelSelect.value || "qwen2.5:32b";
        const engineRadio = document.querySelector('input[name="engineType"]:checked');
        const selectedEngine = engineRadio ? engineRadio.value : "ai_react";

        resetUI();
        learningEventBox.classList.add("hidden");
        const engineLabel = selectedEngine === "ai_react" ? "7-Pillar AI Autonomous ReAct Agent" : "Classic Semantic Brain";
        setAgentState("running", `${engineLabel} Investigating with ${selectedModel}...`);
        btnStopCurrentJob.classList.remove("hidden");
        submitBtn.disabled = true;
        const btnText = submitBtn.querySelector(".btn-text");
        if (btnText) btnText.innerText = " Investigando com IA...";

        appendTerminalLog({
            stage: "PAGE_INGESTION",
            thought: ` Iniciando extração autônoma em: ${url} (Engine: ${selectedEngine}, Modelo: ${selectedModel})`,
        });

        try {
            const res = await fetch("/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: url,
                    headless: true,
                    model_name: selectedModel,
                    engine_type: selectedEngine,
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Failed to start autonomous analysis");
            }

            const data = await res.json();
            currentActiveSessionId = data.session_id;
            getOrCreateSession(data.session_id, url, selectedModel);
            listenToSessionEvents(data.session_id, selectedModel);
            checkActiveJobs();
        } catch (err) {
            setAgentState("ready", "Error");
            alert("Error: " + err.message);
            submitBtn.disabled = false;
            if (btnText) btnText.innerText = "Investigate & Extract";
            appendTerminalLog({
                stage: "REFLECTION",
                thought: ` Erro ao iniciar análise: ${err.message}`,
            });
        }
    });

    // -------------------------------------------------------------
    // CO-PILOT INTERACTIVE MODAL CONTROLLER
    // -------------------------------------------------------------
    const copilotModal = document.getElementById("copilotModal");
    const copilotQuestionText = document.getElementById("copilotQuestionText");
    const copilotTimer = document.getElementById("copilotTimer");
    const copilotSnapshotContainer = document.getElementById("copilotSnapshotContainer");
    const copilotSnapshotImg = document.getElementById("copilotSnapshotImg");
    const copilotOptionsList = document.getElementById("copilotOptionsList");
    const copilotTextInput = document.getElementById("copilotTextInput");
    const copilotSubmitCustom = document.getElementById("copilotSubmitCustom");

    let copilotInterval = null;

    function openCopilotModal(event, sessionId) {
        if (!copilotModal) return;
        copilotQuestionText.innerText = event.question || "Interactive decision required:";
        copilotOptionsList.innerHTML = "";
        copilotTextInput.value = "";

        if (event.screenshot_base64) {
            copilotSnapshotImg.src = `data:image/jpeg;base64,${event.screenshot_base64}`;
            copilotSnapshotContainer.classList.remove("hidden");
        } else {
            copilotSnapshotContainer.classList.add("hidden");
        }

        let timeLeft = Math.round(event.timeout_seconds || 30);
        copilotTimer.innerText = `${timeLeft}s`;
        if (copilotInterval) clearInterval(copilotInterval);
        copilotInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(copilotInterval);
                closeCopilotModal();
            } else {
                copilotTimer.innerText = `${timeLeft}s`;
            }
        }, 1000);

        (event.options || ["Proceed", "Abort"]).forEach(opt => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "copilot-opt-btn";
            btn.innerText = opt;
            btn.onclick = () => submitCopilotResponse(sessionId, opt, "");
            copilotOptionsList.appendChild(btn);
        });

        copilotSubmitCustom.onclick = () => {
            const txt = copilotTextInput.value.trim();
            if (txt) {
                submitCopilotResponse(sessionId, null, txt);
            }
        };

        copilotModal.classList.remove("hidden");
    }

    function closeCopilotModal() {
        if (copilotInterval) clearInterval(copilotInterval);
        if (copilotModal) copilotModal.classList.add("hidden");
    }

    async function submitCopilotResponse(sessionId, selectedOption, textInput) {
        closeCopilotModal();
        try {
            await fetch(`/api/copilot/${sessionId}/respond`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    selected_option: selectedOption,
                    text_input: textInput,
                })
            });
        } catch (e) {
            console.error("Failed to send copilot response", e);
        }
    }

    // -------------------------------------------------------------
    // SSE Real-Time Event Stream Listener Per Session
    // -------------------------------------------------------------
    function listenToSessionEvents(sessionId, modelName) {
        const session = getOrCreateSession(sessionId, "", modelName);
        if (session.eventSource) {
            session.eventSource.close();
        }

        const evSource = new EventSource(`/api/events/${sessionId}`);
        session.eventSource = evSource;

        evSource.onmessage = (e) => {
            const event = JSON.parse(e.data);
            if (event.type === "ping") return;

            handleLiveEvent(event, session);

            if (event.type === "completed" || event.type === "error") {
                evSource.close();
                session.eventSource = null;
                submitBtn.disabled = false;
                const btnText = submitBtn.querySelector(".btn-text");
                if (btnText) btnText.innerText = "Investigate & Extract";
                btnStopCurrentJob.classList.add("hidden");
                setAgentState("ready", event.type === "completed" ? "Investigation Completed" : "Error Occurred");
                updateLibraryBadge();
                checkActiveJobs();
            }
        };

        evSource.onerror = () => {
            setAgentState("ready", "Agent Working in Background");
        };
    }

    function handleLiveEvent(event, session) {
        const card = session.cardEl;
        if (!card) return;

        switch (event.type) {
            case "copilot_question":
                openCopilotModal(event, session.sessionId);
                break;

            case "album_init": {
                emptyState.classList.add("hidden");
                card.classList.remove("hidden");

                // Strictly preserve raw original title without translation
                const rawTitle = event.original_title || event.title || "Discovered Album";
                session.title = rawTitle;
                session.original_title = rawTitle;
                session.source_page = event.source_page || session.url;
                session.page_type = event.page_type || "Gallery";
                session.total_candidates = event.total_candidates || 0;

                card.querySelector(".album-title").innerText = rawTitle;
                card.querySelector(".album-source-url").innerText = `Source: ${session.source_page}`;
                card.querySelector(".album-source-type").innerText = session.page_type.toUpperCase();
                card.querySelector(".album-image-count").innerText = `${session.total_candidates} Candidates`;
                card.querySelector(".album-model-badge").innerText = session.modelName;
                card.querySelector(".album-date-badge").innerText = "Extracting...";

                updateMultiAlbumNav();
                break;
            }

            case "image_resolved": {
                if (!session.images.find(x => x.position === event.position)) {
                    session.images.push(event);
                }
                card.querySelector(".album-image-count").innerText = `${session.images.length} 4K Images`;
                renderSessionGallery(session);
                updateMultiAlbumNav();
                appendTerminalLog({
                    stage: "PROVEN_VECTOR",
                    thought: ` [Resolved 4K] Photo #${event.position} (${event.width && event.height ? `${event.width}x${event.height}` : '4K'}) via ${event.resolution_method || 'direct'}`,
                });
                break;
            }

            case "ai_thought":
                appendTerminalLog(event);
                break;

            case "status":
                setAgentState("running", event.message);
                appendTerminalLog({ stage: "STATUS", thought: ` ${event.message}` });
                break;

            case "telemetry":
                updateTelemetry(event.data);
                break;

            case "candidate_audit":
                appendAuditItem(event.data);
                break;

            case "learning_event":
                learningEventBox.classList.remove("hidden");
                learningEventSummary.innerText = `Domain: ${event.domain} (${event.positive_count} Positives, ${event.negative_count} Negatives)`;
                learningEventList.innerHTML = "";
                (event.evidence || []).forEach(ev => {
                    const li = document.createElement("li");
                    li.innerText = ev;
                    learningEventList.appendChild(li);
                });
                appendTerminalLog({
                    stage: "ARCHETYPE_MATCHING",
                    thought: ` [Learning Priors] Learned rules for ${event.domain} (${event.positive_count} Positives, ${event.negative_count} Negatives)`,
                });
                break;

            case "completed":
                if (event.album) {
                    renderSessionFullAlbum(session, event.album);
                }
                appendTerminalLog({
                    stage: "COMPLETED",
                    thought: ` Album extraction and verification cycle completed. Fully packaged on disk.`,
                });
                break;
        }
    }

    function renderSessionGallery(session) {
        const card = session.cardEl;
        if (!card) return;
        const grid = card.querySelector(".gallery-grid");
        if (!grid) return;

        // Apply view mode class
        grid.className = `gallery-grid ${session.viewMode}`;

        // Sort images
        let sorted = [...session.images];
        if (session.sortBy === "resolution") {
            sorted.sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));
        } else if (session.sortBy === "status") {
            sorted.sort((a, b) => (b.validation_status === "PASS" ? 1 : 0) - (a.validation_status === "PASS" ? 1 : 0));
        } else {
            sorted.sort((a, b) => (a.position || 0) - (b.position || 0));
        }

        grid.innerHTML = "";

        if (session.viewMode === "details") {
            // Details table
            const table = document.createElement("table");
            table.className = "explorer-details-table";
            table.innerHTML = `
                <thead>
                    <tr>
                        <th style="width: 40px;">#</th>
                        <th style="width: 50px;">Capa</th>
                        <th>Dimensões</th>
                        <th>Formato</th>
                        <th>Método</th>
                        <th>Status</th>
                        <th style="width: 100px;">Ação</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
            const tbody = table.querySelector("tbody");
            sorted.forEach(img => {
                const tr = document.createElement("tr");
                const isPass = img.validation_status === "PASS";
                const displaySrc = img.original_url || img.thumbnail_url;
                const proxyDisplaySrc = getProxyUrl(displaySrc, session.source_page);
                const resText = (img.width && img.height) ? `${img.width}x${img.height}` : "4K Original";

                tr.innerHTML = `
                    <td>#${img.position}</td>
                    <td><img src="${proxyDisplaySrc}" class="table-thumb" alt="#${img.position}" loading="lazy" referrerpolicy="no-referrer" /></td>
                    <td><strong>${resText}</strong></td>
                    <td>${img.format || 'jpg'}</td>
                    <td><span class="method-tag">${img.resolution_method || 'direct'}</span></td>
                    <td><span class="status-tag ${isPass ? 'pass' : 'unresolved'}">${img.validation_status}</span></td>
                    <td>
                        ${img.original_url ? `<a href="/api/download-image?url=${encodeURIComponent(img.original_url)}&filename=${img.position}_highres.jpg" target="_blank" class="btn-img-download" style="padding: 2px 6px; font-size: 0.72rem;">⬇ 4K</a>` : '-'}
                    </td>
                `;
                tr.addEventListener("click", () => openImageModal(img, session.source_page));
                tbody.appendChild(tr);
            });
            grid.appendChild(table);
        } else {
            // Cards / List / Tiles
            sorted.forEach(img => {
                const imgCard = createSingleImageCard(img, session);
                grid.appendChild(imgCard);
            });
        }
    }

    function createSingleImageCard(imgData, session) {
        const isPass = imgData.validation_status === "PASS";
        const resText = (imgData.width && imgData.height) ? `${imgData.width}x${imgData.height}` : "4K Original";
        const displaySrc = imgData.original_url || imgData.thumbnail_url;
        const proxyDisplaySrc = getProxyUrl(displaySrc, session.source_page);

        const card = document.createElement("div");
        card.className = "gallery-item";
        card.id = `img_card_${session.sessionId}_${imgData.position}`;

        card.innerHTML = `
            <div class="gallery-img-wrapper">
                <img src="${proxyDisplaySrc}" alt="Photo ${imgData.position}" referrerpolicy="no-referrer" loading="lazy" />
                <span class="img-pos-badge">#${imgData.position}</span>
                <span class="img-res-badge ${isPass ? 'pass' : 'unresolved'}">${resText}</span>
                <div class="gallery-action-bar">
                    ${imgData.original_url ? `<a href="/api/download-image?url=${encodeURIComponent(imgData.original_url)}&filename=${imgData.position}_highres.jpg" target="_blank" class="btn-img-download" title="Download High-Res 4K Image Directly" onclick="event.stopPropagation();">⬇ Download</a>` : ''}
                </div>
            </div>
            <div class="gallery-item-meta">
                <span class="method-tag">${imgData.resolution_method || 'direct'}</span>
                <span class="status-tag ${isPass ? 'pass' : 'unresolved'}">${imgData.validation_status}</span>
            </div>
        `;

        card.addEventListener("click", () => {
            openImageModal(imgData, session.source_page);
        });

        return card;
    }

    function renderSessionFullAlbum(session, albumSummary) {
        const card = session.cardEl;
        if (!card) return;

        // Preserve raw original title
        const rawTitle = albumSummary.original_title || albumSummary.title || "Discovered Album";
        session.title = rawTitle;
        session.original_title = rawTitle;
        session.source_page = albumSummary.source_page || session.url;
        session.images = albumSummary.images || session.images;

        card.querySelector(".album-title").innerText = rawTitle;
        card.querySelector(".album-source-url").innerText = `Source: ${session.source_page}`;
        card.querySelector(".album-source-type").innerText = (albumSummary.page_type || "Gallery").toUpperCase();
        card.querySelector(".album-image-count").innerText = `${session.images.length} High-Res Images`;
        card.querySelector(".album-model-badge").innerText = albumSummary.metadata?.model_used || session.modelName;
        card.querySelector(".album-date-badge").innerText = albumSummary.metadata?.saved_at || "Saved on Disk";

        renderSessionGallery(session);
        updateMultiAlbumNav();

        if (albumSummary.telemetry) {
            updateTelemetry(albumSummary.telemetry);
        }
    }

    // -------------------------------------------------------------
    // MODE 2: Learning by Demonstration (Scan & Tag)
    // -------------------------------------------------------------
    scanBtn.addEventListener("click", async () => {
        let url = teachUrl.value.trim();
        if (!url) {
            alert("Por favor, digite ou cole a URL da página para escanear os candidatos.");
            teachUrl.focus();
            return;
        }

        if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("/")) {
            url = "https://" + url;
            teachUrl.value = url;
        }

        scanBtn.disabled = true;
        scanBtn.innerText = "Scanning Page & Resolving Sources...";
        candidatePickerGrid.innerHTML = '<div class="empty-audit">Scanning DOM and loading candidate images...</div>';
        positiveIds.clear();
        negativeIds.clear();
        groundTruthMap.clear();
        selectedForBatch.clear();
        lastClickedCandidateIndex = -1;
        updateTeachStats();
        updateBatchBar();

        try {
            const res = await fetch("/api/scan-candidates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: url, headless: true })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Scan failed");
            }

            const data = await res.json();
            scannedCandidates = data.candidates || [];
            renderCandidatePicker(scannedCandidates, url);
        } catch (err) {
            alert("Scan Error: " + err.message);
            candidatePickerGrid.innerHTML = `<div class="empty-audit">Error: ${err.message}</div>`;
        } finally {
            scanBtn.disabled = false;
            scanBtn.innerText = "Scan Candidates";
        }
    });

    function renderCandidatePicker(candidates, sourceUrl) {
        candidatePickerGrid.innerHTML = "";
        if (candidates.length === 0) {
            candidatePickerGrid.innerHTML = '<div class="empty-audit">No image candidates found on page.</div>';
            return;
        }

        candidates.forEach((c, index) => {
            const card = document.createElement("div");
            card.className = "picker-card";
            card.id = `pick_${c.candidate_id}`;
            card.dataset.index = index;

            const containerInfo = c.container_selector || "N/A";
            const parentInfo = c.parent_href ? (c.parent_href.length > 30 ? c.parent_href.slice(-25) : c.parent_href) : "None";
            const resText = (c.width && c.height) ? `${c.width}x${c.height}` : "300x450";
            const proxySrc = getProxyUrl(c.src, sourceUrl);

            card.innerHTML = `
                <div class="picker-img-wrapper">
                    <img src="${proxySrc}" alt="${c.alt || ''}" referrerpolicy="no-referrer" loading="lazy" />
                    <span class="pos-tag">${resText}</span>
                    <div class="picker-select-checkbox"></div>
                    <div class="picker-quick-bar">
                        ${c.parent_href ? `<a href="${c.parent_href}" target="_blank" class="quick-link" title="Open Parent Link in New Tab" onclick="event.stopPropagation();"> Link</a>` : ''}
                        ${c.src ? `<a href="${c.src}" target="_blank" class="quick-link" title="Open Direct Image in New Tab" onclick="event.stopPropagation();"> Direct</a>` : ''}
                    </div>
                    <div class="picker-info-overlay">
                        <div><strong>Container:</strong> ${containerInfo}</div>
                        <div><strong>Parent:</strong> ${parentInfo}</div>
                    </div>
                </div>
                <div class="picker-actions">
                    <button type="button" class="btn-pick btn-pick-pos" title="Belongs to Album">+ Add</button>
                    <button type="button" class="btn-pick btn-pick-neg" title="Reject as Noise / Banner / Related">- Noise</button>
                </div>
                <div class="picker-groundtruth-box">
                    <input type="url" class="input-groundtruth" placeholder="Paste real 4K URL here (optional)" data-id="${c.candidate_id}" onclick="event.stopPropagation();" />
                </div>
            `;

            // Ground truth input listener
            const gtInput = card.querySelector(".input-groundtruth");
            gtInput.addEventListener("input", (e) => {
                const val = e.target.value.trim();
                if (val) {
                    groundTruthMap.set(c.candidate_id, val);
                    positiveIds.add(c.candidate_id);
                    negativeIds.delete(c.candidate_id);
                    card.classList.add("positive");
                    card.classList.remove("negative");
                } else {
                    groundTruthMap.delete(c.candidate_id);
                }
                updateTeachStats();
            });

            // Card Click Handler (Selection with Shift + Click support)
            card.addEventListener("click", (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A' || e.target.tagName === 'INPUT') return;

                if (e.shiftKey && lastClickedCandidateIndex >= 0) {
                    const start = Math.min(lastClickedCandidateIndex, index);
                    const end = Math.max(lastClickedCandidateIndex, index);
                    for (let i = start; i <= end; i++) {
                        const targetCard = candidatePickerGrid.children[i];
                        if (targetCard && scannedCandidates[i]) {
                            selectedForBatch.add(scannedCandidates[i].candidate_id);
                            targetCard.classList.add("selected");
                        }
                    }
                } else {
                    if (selectedForBatch.has(c.candidate_id)) {
                        selectedForBatch.delete(c.candidate_id);
                        card.classList.remove("selected");
                    } else {
                        selectedForBatch.add(c.candidate_id);
                        card.classList.add("selected");
                    }
                    lastClickedCandidateIndex = index;
                }
                updateBatchBar();
            });

            // Individual Positive / Negative Buttons
            const btnPos = card.querySelector(".btn-pick-pos");
            const btnNeg = card.querySelector(".btn-pick-neg");

            btnPos.addEventListener("click", (e) => {
                e.stopPropagation();
                if (positiveIds.has(c.candidate_id)) {
                    positiveIds.delete(c.candidate_id);
                    card.classList.remove("positive");
                } else {
                    positiveIds.add(c.candidate_id);
                    negativeIds.delete(c.candidate_id);
                    card.classList.add("positive");
                    card.classList.remove("negative");
                }
                updateTeachStats();
            });

            btnNeg.addEventListener("click", (e) => {
                e.stopPropagation();
                if (negativeIds.has(c.candidate_id)) {
                    negativeIds.delete(c.candidate_id);
                    card.classList.remove("negative");
                } else {
                    negativeIds.add(c.candidate_id);
                    positiveIds.delete(c.candidate_id);
                    groundTruthMap.delete(c.candidate_id);
                    gtInput.value = "";
                    card.classList.add("negative");
                    card.classList.remove("positive");
                }
                updateTeachStats();
            });

            candidatePickerGrid.appendChild(card);
        });
    }

    // Batch Actions
    btnSelectAll.addEventListener("click", () => {
        scannedCandidates.forEach(c => selectedForBatch.add(c.candidate_id));
        document.querySelectorAll(".picker-card").forEach(card => card.classList.add("selected"));
        updateBatchBar();
    });

    btnDeselectAll.addEventListener("click", () => {
        selectedForBatch.clear();
        document.querySelectorAll(".picker-card").forEach(card => card.classList.remove("selected"));
        updateBatchBar();
    });

    btnInvertSelection.addEventListener("click", () => {
        scannedCandidates.forEach(c => {
            const card = document.getElementById(`pick_${c.candidate_id}`);
            if (selectedForBatch.has(c.candidate_id)) {
                selectedForBatch.delete(c.candidate_id);
                if (card) card.classList.remove("selected");
            } else {
                selectedForBatch.add(c.candidate_id);
                if (card) card.classList.add("selected");
            }
        });
        updateBatchBar();
    });

    btnSelectSameContainer.addEventListener("click", () => {
        if (selectedForBatch.size === 0) {
            alert("Selecione pelo menos 1 imagem primeiro para que o sistema identifique a grade/container correspondente!");
            return;
        }

        const selectedCands = scannedCandidates.filter(c => selectedForBatch.has(c.candidate_id));
        const targetContainers = new Set();
        const targetClasses = new Set();
        const targetAspectRatios = [];

        selectedCands.forEach(cand => {
            if (cand.container_selector) {
                targetContainers.add(cand.container_selector.toLowerCase().trim());
            }
            (cand.classes || []).forEach(cls => {
                if (cls.length > 2 && !/^[0-9]+$/.test(cls)) {
                    targetClasses.add(cls.toLowerCase().trim());
                }
            });
            if (cand.width && cand.height && cand.height > 0) {
                targetAspectRatios.push(cand.width / cand.height);
            }
        });

        const avgAr = targetAspectRatios.length > 0 ? (targetAspectRatios.reduce((a, b) => a + b, 0) / targetAspectRatios.length) : null;

        scannedCandidates.forEach(c => {
            if (selectedForBatch.has(c.candidate_id)) return;

            let isMatch = false;

            // 1. Direct container selector match
            if (c.container_selector && targetContainers.has(c.container_selector.toLowerCase().trim())) {
                isMatch = true;
            }

            // 2. Shared candidate class match
            if (!isMatch && c.classes && c.classes.length > 0) {
                for (const cls of c.classes) {
                    if (targetClasses.has(cls.toLowerCase().trim())) {
                        isMatch = true;
                        break;
                    }
                }
            }

            // 3. Aspect ratio and sibling proximity clustering
            if (!isMatch && avgAr && c.width && c.height && c.height > 0) {
                const cAr = c.width / c.height;
                const arDiff = Math.abs(cAr - avgAr);
                const hasSharedContainerPattern = c.container_selector && Array.from(targetContainers).some(tc => {
                    const tag = tc.split(/[\.\#]/)[0];
                    return c.container_selector.toLowerCase().startsWith(tag);
                });
                if (arDiff < 0.15 && hasSharedContainerPattern) {
                    isMatch = true;
                }
            }

            if (isMatch) {
                selectedForBatch.add(c.candidate_id);
                const card = document.getElementById(`pick_${c.candidate_id}`);
                if (card) card.classList.add("selected");
            }
        });

        updateBatchBar();
    });

    btnBatchMarkPos.addEventListener("click", () => {
        selectedForBatch.forEach(id => {
            positiveIds.add(id);
            negativeIds.delete(id);
            const card = document.getElementById(`pick_${id}`);
            if (card) {
                card.classList.add("positive");
                card.classList.remove("negative");
            }
        });
        updateTeachStats();
    });

    btnBatchMarkNeg.addEventListener("click", () => {
        selectedForBatch.forEach(id => {
            negativeIds.add(id);
            positiveIds.delete(id);
            groundTruthMap.delete(id);
            const card = document.getElementById(`pick_${id}`);
            if (card) {
                card.classList.add("negative");
                card.classList.remove("positive");
                const gt = card.querySelector(".input-groundtruth");
                if (gt) gt.value = "";
            }
        });
        updateTeachStats();
    });

    function updateBatchBar() {
        const count = selectedForBatch.size;
        batchSelectedCount.innerText = `${count} selected`;
        btnBatchMarkPos.disabled = count === 0;
        btnBatchMarkNeg.disabled = count === 0;
    }

    function updateTeachStats() {
        countPos.innerText = positiveIds.size;
        countNeg.innerText = negativeIds.size;
        countGroundTruth.innerText = groundTruthMap.size;
        teachSubmitBtn.disabled = (positiveIds.size === 0);
    }

    // Mode 2 Submit (Generalize & Resolve Originals with Ground-Truth Induction)
    teachSubmitBtn.addEventListener("click", async () => {
        const url = teachUrl.value.trim();
        if (!url || positiveIds.size === 0) return;

        const selectedModel = modelSelect.value;
        const teachEngineRadio = document.querySelector('input[name="teachEngineType"]:checked');
        const selectedTeachEngine = teachEngineRadio ? teachEngineRadio.value : "both";

        resetUI();
        learningEventBox.classList.add("hidden");
        const teachEngineLabel = selectedTeachEngine === "both" ? "Dual-Brain Synchronized Learning" : (selectedTeachEngine === "ai_react" ? "7-Pillar AI Autonomous ReAct Agent" : "Classic Semantic Brain");
        setAgentState("running", `${teachEngineLabel}: Inducing Patterns & Investigating ${positiveIds.size} Images...`);
        btnStopCurrentJob.classList.remove("hidden");

        const gtObj = {};
        groundTruthMap.forEach((v, k) => { if (v) gtObj[k] = v; });

        try {
            const res = await fetch("/api/demonstrate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: url,
                    positive_ids: Array.from(positiveIds),
                    negative_ids: Array.from(negativeIds),
                    ground_truth_urls: gtObj,
                    headless: true,
                    model_name: selectedModel,
                    engine_type: selectedTeachEngine,
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Demonstration failed");
            }

            const data = await res.json();
            currentActiveSessionId = data.session_id;
            getOrCreateSession(data.session_id, url, selectedModel);
            listenToSessionEvents(data.session_id, selectedModel);
            checkActiveJobs();
        } catch (err) {
            setAgentState("ready", "Error");
            alert("Error: " + err.message);
        }
    });

    function appendTerminalLog(logData) {
        if (!liveTerminalConsole) return;
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        
        const stage = logData.stage || "COGNITIVE_STEP";
        const text = logData.thought || logData.message || logData.text || "";
        const category = getLogCategory(stage, text);

        terminalLogsHistory.push({ timeStr, stage, text, category, raw: logData });
        if (countLogsAll) countLogsAll.innerText = terminalLogsHistory.length;

        const row = document.createElement("div");
        row.className = `terminal-log-row log-${category}`;
        row.setAttribute("data-category", category);

        // Color pills for different pipeline stages
        let pillClass = "pill-llm";
        const sUpper = stage.toUpperCase();
        if (sUpper.includes("SPECULATIVE") || sUpper.includes("PROBE")) pillClass = "pill-speculative";
        if (sUpper.includes("PROVEN") || sUpper.includes("PASS") || text.includes("")) pillClass = "pill-probe-pass";
        if (sUpper.includes("OBSERVATION")) pillClass = "pill-observation";
        if (sUpper.includes("NETWORK") || sUpper.includes("MANIFEST")) pillClass = "pill-network";
        if (sUpper.includes("REFLECTION") || text.includes("️") || text.includes("")) pillClass = "pill-reflection";
        if (sUpper.includes("SCALING")) pillClass = "pill-scaling";
        if (sUpper.includes("COMPLETED")) pillClass = "pill-completed";
        if (sUpper.includes("DETAIL")) pillClass = "pill-detail";

        let formattedText = escapeHtml(text);
        if (formattedText.includes("[ LLM:")) {
            formattedText = formattedText.replace(/\[ LLM:\s*([^\]]+)\]/, '<strong style="color: #38bdf8;"> [LLM: $1]</strong>');
        } else if (formattedText.includes("[ Autonomous Brain Core]")) {
            formattedText = formattedText.replace(/\[ Autonomous Brain Core\]/, '<strong style="color: #a78bfa;"> [Brain Core]</strong>');
        }

        if (sUpper.includes("SERVER_EXCEPTION") || logData.traceback) {
            pillClass = "pill-server-err";
            row.className = `terminal-log-row log-server-error log-${category}`;
            const tbHtml = escapeHtml(logData.traceback || text);
            const errTitle = escapeHtml(logData.thought || logData.error || "Server Exception");
            row.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;width:100%;">
                    <span class="log-ts">[${timeStr}]</span>
                    <span class="log-pill pill-server-err"> SERVER TRACEBACK</span>
                    <span class="log-text" style="color:#f87171;font-weight:700;">${errTitle}</span>
                </div>
                <div class="log-traceback-box">${tbHtml}</div>
            `;
        } else {
            row.innerHTML = `
                <span class="log-ts">[${timeStr}]</span>
                <span class="log-pill ${pillClass}">${stage}</span>
                <span class="log-text">${formattedText}</span>
            `;
        }

        if (currentTerminalFilter !== "all" && currentTerminalFilter !== category) {
            row.style.display = "none";
        }

        liveTerminalConsole.appendChild(row);

        if (autoScrollEnabled) {
            liveTerminalConsole.scrollTop = liveTerminalConsole.scrollHeight;
        }
    }

    function getLogCategory(stage, text) {
        const s = (stage || "").toUpperCase();
        const t = (text || "").toUpperCase();
        if (s.includes("EXCEPTION") || s.includes("ERROR") || t.includes("EXCEPTION") || t.includes("TRACEBACK")) return "llm";
        if (s.includes("LLM") || s.includes("REACT") || t.includes("LLM") || t.includes("REASONING") || t.includes("THOUGHT")) return "llm";
        if (s.includes("PROBE") || s.includes("SPECULATIVE") || s.includes("PROVEN") || t.includes("PROBE")) return "probes";
        if (s.includes("NETWORK") || s.includes("MANIFEST") || s.includes("SNIFFER") || t.includes("MANIFEST")) return "network";
        if (s.includes("LEARN") || s.includes("ARCHETYPE") || t.includes("KNOWLEDGE") || t.includes("PRIOR")) return "learning";
        return "llm";
    }

    function escapeHtml(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // Terminal Filter Tabs
    document.querySelectorAll(".terminal-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".terminal-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            currentTerminalFilter = tab.getAttribute("data-filter") || "all";

            if (currentTerminalFilter === "ledger") {
                liveTerminalConsole.classList.add("hidden");
                auditList.classList.remove("hidden");
            } else {
                liveTerminalConsole.classList.remove("hidden");
                auditList.classList.add("hidden");

                document.querySelectorAll(".terminal-log-row").forEach(row => {
                    const cat = row.getAttribute("data-category");
                    if (currentTerminalFilter === "all" || currentTerminalFilter === cat) {
                        row.style.display = "flex";
                    } else {
                        row.style.display = "none";
                    }
                });
                if (autoScrollEnabled) {
                    liveTerminalConsole.scrollTop = liveTerminalConsole.scrollHeight;
                }
            }
        });
    });

    // Terminal Action Buttons
    btnCopyTerminalLogs?.addEventListener("click", () => {
        if (terminalLogsHistory.length === 0) {
            alert("Nenhum log gravado ainda.");
            return;
        }
        const plainLogs = terminalLogsHistory.map(l => `[${l.timeStr}] [${l.stage}] ${l.text}`).join("\n");
        navigator.clipboard.writeText(plainLogs).then(() => {
            const originalHtml = btnCopyTerminalLogs.innerHTML;
            btnCopyTerminalLogs.innerHTML = " Copiado!";
            btnCopyTerminalLogs.style.color = "#10b981";
            setTimeout(() => {
                btnCopyTerminalLogs.innerHTML = originalHtml;
                btnCopyTerminalLogs.style.color = "";
            }, 1800);
        }).catch(err => {
            alert("Não foi possível copiar os logs: " + err);
        });
    });

    btnClearTerminalLogs?.addEventListener("click", () => {
        liveTerminalConsole.innerHTML = `
            <div class="terminal-welcome">
                <span class="terminal-prompt">$</span> Console cleared. Live listener active.
            </div>
        `;
        terminalLogsHistory.length = 0;
        if (countLogsAll) countLogsAll.innerText = "0";
    });

    btnToggleAutoScroll?.addEventListener("click", () => {
        autoScrollEnabled = !autoScrollEnabled;
        if (autoScrollEnabled) {
            btnToggleAutoScroll.classList.add("active");
            btnToggleAutoScroll.innerText = "⬇ Auto-scroll";
            terminalLiveLed?.classList.remove("pulse-paused");
            terminalLiveLed?.classList.add("pulse-online");
            if (terminalLiveStatus) terminalLiveStatus.innerText = "LIVE";
            liveTerminalConsole.scrollTop = liveTerminalConsole.scrollHeight;
        } else {
            btnToggleAutoScroll.classList.remove("active");
            btnToggleAutoScroll.innerText = "⏸ Pausado";
            terminalLiveLed?.classList.remove("pulse-online");
            terminalLiveLed?.classList.add("pulse-paused");
            if (terminalLiveStatus) terminalLiveStatus.innerText = "PAUSED";
        }
    });

    function appendAuditItem(audit) {
        let el = document.getElementById(`audit_${audit.candidate_id}`);
        const isPass = audit.validation_verdict === "PASS";
        const verdictClass = isPass ? "pass" : "unresolved";

        if (!el) {
            el = document.createElement("div");
            el.className = "audit-item";
            el.id = `audit_${audit.candidate_id}`;
            auditList.prepend(el);
            currentProcessedCount++;
            if (auditCountBadge) auditCountBadge.innerText = `${currentProcessedCount}`;
        }

        const actionsHtml = (audit.actions || []).map(a => `<li>→ ${a}</li>`).join("");
        const evidenceHtml = (audit.classification_evidence || []).map(e => `<li>${e}</li>`).join("");

        el.innerHTML = `
            <div class="audit-candidate-header">
                <strong>Candidate (${audit.candidate_id})</strong>
                <span class="audit-classification">${audit.classification || 'unknown'}</span>
            </div>
            ${evidenceHtml ? `<div class="audit-evidence"><strong>Evidence:</strong><ul>${evidenceHtml}</ul></div>` : ''}
            <div class="audit-actions">
                <strong>Actions:</strong>
                <ul>${actionsHtml}</ul>
            </div>
            <div class="audit-verdict ${verdictClass}">Verdict: ${audit.validation_verdict || 'PENDING'} ${audit.dimensions ? `(${audit.dimensions})` : ''}</div>
        `;
    }

    function updateTelemetry(data) {
        if (!data) return;
        if (data.ai_actions_count !== undefined && mAiActions) mAiActions.innerText = data.ai_actions_count;
        if (data.browser_actions_count !== undefined && mBrowserActions) mBrowserActions.innerText = data.browser_actions_count;
        if (data.candidates_discovered !== undefined && mDiscovered) mDiscovered.innerText = data.candidates_discovered;
        if (data.candidates_investigated !== undefined && mInvestigated) mInvestigated.innerText = data.candidates_investigated;
        if (data.originals_resolved !== undefined && mResolved) mResolved.innerText = data.originals_resolved;
        if (data.originals_unresolved !== undefined && mUnresolved) mUnresolved.innerText = data.originals_unresolved;
        if (data.banners_rejected !== undefined && mBanners) mBanners.innerText = data.banners_rejected;
        if (data.related_filtered !== undefined && mRelated) mRelated.innerText = data.related_filtered;
    }

    function setAgentState(state, text) {
        if (!engineStatus) return;
        const dot = engineStatus.querySelector(".status-dot");
        const statusText = engineStatus.querySelector(".status-text");
        if (statusText) statusText.innerText = text;

        if (state === "running") {
            if (dot) {
                dot.style.background = "var(--accent-blue)";
                dot.style.boxShadow = "0 0 10px var(--accent-blue)";
            }
            if (submitBtn) submitBtn.disabled = true;
        } else {
            if (dot) {
                dot.style.background = "var(--accent-emerald)";
                dot.style.boxShadow = "0 0 8px var(--accent-emerald)";
            }
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    function resetUI() {
        activeSessions.forEach(s => {
            if (s.eventSource) s.eventSource.close();
        });
        activeSessions.clear();
        if (albumsContainer) albumsContainer.innerHTML = "";
        if (multiAlbumTabs) multiAlbumTabs.innerHTML = "";
        if (multiAlbumNav) multiAlbumNav.classList.add("hidden");
        if (auditList) auditList.innerHTML = "";
        currentProcessedCount = 0;
        currentActiveSessionId = null;
        currentSelectedTabSession = "all";
        if (auditCountBadge) auditCountBadge.innerText = "0";
        if (mAiActions) mAiActions.innerText = "0";
        if (mBrowserActions) mBrowserActions.innerText = "0";
        if (mDiscovered) mDiscovered.innerText = "0";
        if (mInvestigated) mInvestigated.innerText = "0";
        if (mResolved) mResolved.innerText = "0";
        if (mUnresolved) mUnresolved.innerText = "0";
        if (mBanners) mBanners.innerText = "0";
        if (mRelated) mRelated.innerText = "0";
    }

    // -------------------------------------------------------------
    // SAVED STORAGE / LIBRARY WITH WINDOWS EXPLORER CONTROLS
    // -------------------------------------------------------------
    async function updateLibraryBadge() {
        try {
            const res = await fetch("/api/albums");
            if (res.ok) {
                const albums = await res.json();
                savedAlbumsCount.innerText = albums.length;
            }
        } catch (e) {}
    }
    updateLibraryBadge();

    async function fetchAndRenderLibrary() {
        try {
            libraryContainer.innerHTML = '<div class="empty-audit">Carregando álbuns salvos em disco...</div>';
            const res = await fetch("/api/albums");
            if (!res.ok) throw new Error("Erro ao carregar álbuns");
            allSavedAlbums = await res.json();
            renderExplorerLibrary();
        } catch (e) {
            libraryContainer.innerHTML = `<div class="empty-audit">Erro ao carregar biblioteca: ${e.message}</div>`;
        }
    }

    // Search and Status Filter Listeners
    librarySearchInput.addEventListener("input", renderExplorerLibrary);
    libraryStatusFilter.addEventListener("change", renderExplorerLibrary);
    explorerSortBy.addEventListener("change", renderExplorerLibrary);

    // Sort Order Toggle (Ascending / Descending)
    btnSortOrder.addEventListener("click", () => {
        sortDirection = sortDirection === "desc" ? "asc" : "desc";
        sortOrderIcon.innerText = sortDirection === "desc" ? "▼" : "▲";
        sortOrderLabel.innerText = sortDirection === "desc" ? "Decrescente" : "Crescente";
        renderExplorerLibrary();
    });

    // View Mode Switcher
    explorerViewMode.addEventListener("change", (e) => {
        const mode = e.target.value;
        libraryContainer.className = `library-container ${mode}`;
        renderExplorerLibrary();
    });

    function renderExplorerLibrary() {
        if (!allSavedAlbums || allSavedAlbums.length === 0) {
            libraryContainer.innerHTML = `
                <div class="empty-library-box">
                    <h4>Nenhum álbum salvo em disco ainda</h4>
                    <p>Execute uma extração no Modo 1 ou Modo 2. Todos os álbuns 4K são salvos de forma persistente.</p>
                </div>
            `;
            return;
        }

        const query = librarySearchInput.value.toLowerCase().trim();
        const statusFilter = libraryStatusFilter.value;
        const sortBy = explorerSortBy.value;
        const currentView = explorerViewMode.value;

        // 1. Filter
        let filtered = allSavedAlbums.filter(a => {
            const title = (a.title || "").toLowerCase();
            const origTitle = (a.original_title || "").toLowerCase();
            const url = (a.source_page || "").toLowerCase();
            const date = (a.metadata?.saved_at || "").toLowerCase();

            const matchesQuery = !query || title.includes(query) || origTitle.includes(query) || url.includes(query) || date.includes(query);
            if (!matchesQuery) return false;

            if (statusFilter === "resolved") {
                return (a.unresolved_count || 0) === 0;
            } else if (statusFilter === "unresolved") {
                return (a.unresolved_count || 0) > 0;
            }
            return true;
        });

        // 2. Sort
        filtered.sort((a, b) => {
            let valA, valB;
            switch (sortBy) {
                case "name":
                    valA = (a.original_title || a.title || "").toLowerCase();
                    valB = (b.original_title || b.title || "").toLowerCase();
                    break;
                case "count":
                    valA = a.total_images || (a.images ? a.images.length : 0);
                    valB = b.total_images || (b.images ? b.images.length : 0);
                    break;
                case "resolution":
                    valA = a.resolved_count || 0;
                    valB = b.resolved_count || 0;
                    break;
                case "status":
                    valA = (a.unresolved_count || 0);
                    valB = (b.unresolved_count || 0);
                    break;
                case "date":
                default:
                    valA = a.metadata?.saved_at || "";
                    valB = b.metadata?.saved_at || "";
                    break;
            }

            if (valA < valB) return sortDirection === "asc" ? -1 : 1;
            if (valA > valB) return sortDirection === "asc" ? 1 : -1;
            return 0;
        });

        if (filtered.length === 0) {
            libraryContainer.innerHTML = '<div class="empty-audit">Nenhum álbum encontrado com os filtros selecionados.</div>';
            return;
        }

        // 3. Render according to View Mode
        if (currentView === "details") {
            renderDetailsTableView(filtered);
        } else {
            renderCardsView(filtered, currentView);
        }
    }

    function renderCardsView(albums, viewMode) {
        libraryContainer.innerHTML = "";
        albums.forEach(album => {
            const sid = album.session_id;
            const thumbImg = (album.images && album.images.length > 0) ? (album.images[0].thumbnail_url || album.images[0].original_url) : "";
            const proxyThumb = getProxyUrl(thumbImg, album.source_page);
            const total = album.total_images || (album.images ? album.images.length : 0);
            const resolved = album.resolved_count || total;
            const dateStr = album.metadata?.saved_at || "Recente";
            const isResolved = (album.unresolved_count || 0) === 0;
            const displayTitle = album.original_title || album.title;

            const card = document.createElement("div");
            card.className = "library-card";

            card.innerHTML = `
                <div class="lib-thumb-wrapper">
                    ${proxyThumb ? `<img src="${proxyThumb}" class="lib-thumb" alt="${displayTitle}" loading="lazy" referrerpolicy="no-referrer" />` : '<div class="empty-thumb">No Preview</div>'}
                    <span class="lib-badge-count">${total} imgs</span>
                </div>
                <div class="lib-info">
                    <div>
                        <div class="lib-title" title="${displayTitle}">${displayTitle}</div>
                        <div class="lib-meta">
                            <div> ${dateStr}</div>
                            <div> ${resolved}/${total} 4K (${isResolved ? '100% Resolvido' : 'Parcial'})</div>
                        </div>
                    </div>
                    <div class="lib-actions">
                        <button type="button" class="lib-btn-view" data-id="${sid}"> Ver Álbum</button>
                        <a href="/api/albums/${sid}/download-zip" target="_blank" class="lib-btn-zip" title="Baixar ZIP">⬇ ZIP</a>
                        <button type="button" class="lib-btn-rename" data-id="${sid}" title="Renomear Álbum"></button>
                        <button type="button" class="lib-btn-del" data-id="${sid}" title="Excluir Álbum"></button>
                    </div>
                </div>
            `;

            card.querySelector(".lib-btn-view").addEventListener("click", () => loadSavedAlbum(sid));
            card.querySelector(".lib-btn-rename")?.addEventListener("click", () => openRenameModal(sid, displayTitle));
            card.querySelector(".lib-btn-del").addEventListener("click", () => openDeleteModal(sid, displayTitle));

            libraryContainer.appendChild(card);
        });
    }

    function renderDetailsTableView(albums) {
        libraryContainer.innerHTML = `
            <table class="explorer-details-table">
                <thead>
                    <tr>
                        <th style="width: 50px;">Capa</th>
                        <th>Título Original (Site)</th>
                        <th>Título Personalizado</th>
                        <th>Data</th>
                        <th>Qtd Imagens</th>
                        <th>Resolução 4K</th>
                        <th>Status</th>
                        <th style="width: 140px;">Ações</th>
                    </tr>
                </thead>
                <tbody id="detailsTableBody"></tbody>
            </table>
        `;
        const tbody = document.getElementById("detailsTableBody");

        albums.forEach(album => {
            const sid = album.session_id;
            const thumbImg = (album.images && album.images.length > 0) ? (album.images[0].thumbnail_url || album.images[0].original_url) : "";
            const proxyThumb = getProxyUrl(thumbImg, album.source_page);
            const total = album.total_images || (album.images ? album.images.length : 0);
            const resolved = album.resolved_count || total;
            const dateStr = album.metadata?.saved_at || "Recente";
            const isResolved = (album.unresolved_count || 0) === 0;
            const rawTitle = album.original_title || album.title;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    ${proxyThumb ? `<img src="${proxyThumb}" class="table-thumb" alt="${rawTitle}" loading="lazy" referrerpolicy="no-referrer" />` : '-'}
                </td>
                <td><strong>${rawTitle}</strong></td>
                <td><span style="color: var(--text-secondary); font-size: 0.78rem;">${album.title !== rawTitle ? album.title : '-'}</span></td>
                <td>${dateStr}</td>
                <td>${total} fotos</td>
                <td>${resolved} / ${total}</td>
                <td>
                    <span class="status-tag ${isResolved ? 'pass' : 'unresolved'}">${isResolved ? '100% 4K' : 'Parcial'}</span>
                </td>
                <td>
                    <div style="display: flex; gap: 4px;">
                        <button type="button" class="lib-btn-view" style="padding: 4px 8px; font-size: 0.72rem;" data-id="${sid}"> Ver</button>
                        <a href="/api/albums/${sid}/download-zip" target="_blank" class="lib-btn-zip" style="padding: 4px 6px; font-size: 0.72rem;" title="ZIP">⬇</a>
                        <button type="button" class="lib-btn-rename" data-id="${sid}" style="padding: 4px 6px; font-size: 0.72rem; cursor: pointer;"></button>
                        <button type="button" class="lib-btn-del" data-id="${sid}" style="padding: 4px 6px; font-size: 0.72rem;" title="Excluir"></button>
                    </div>
                </td>
            `;

            tr.querySelector(".lib-btn-view").addEventListener("click", () => loadSavedAlbum(sid));
            tr.querySelector(".lib-btn-rename")?.addEventListener("click", () => openRenameModal(sid, rawTitle));
            tr.querySelector(".lib-btn-del").addEventListener("click", () => openDeleteModal(sid, rawTitle));

            tbody.appendChild(tr);
        });
    }

    async function loadSavedAlbum(sessionId) {
        try {
            const res = await fetch(`/api/albums/${sessionId}`);
            if (!res.ok) throw new Error("Álbum não encontrado");
            const album = await res.json();
            switchTab(tabMode1, panelMode1);

            resetUI();
            const session = getOrCreateSession(sessionId, album.source_page, album.metadata?.model_used || "Qwen 2.5:32b");
            renderSessionFullAlbum(session, album);
        } catch (e) {
            alert("Erro ao abrir álbum: " + e.message);
        }
    }

    // -------------------------------------------------------------
    // RENAME & DELETE MODALS
    // -------------------------------------------------------------
    function openRenameModal(sessionId, currentTitle) {
        targetAlbumForRename = sessionId;
        renameTitleInput.value = currentTitle;
        renameModal.classList.remove("hidden");
        renameTitleInput.focus();
    }

    function closeRenameModal() {
        renameModal.classList.add("hidden");
        targetAlbumForRename = null;
    }

    btnCancelRename.addEventListener("click", closeRenameModal);
    renameModalOverlay.addEventListener("click", closeRenameModal);

    btnConfirmRename.addEventListener("click", async () => {
        const newTitle = renameTitleInput.value.trim();
        if (!newTitle || !targetAlbumForRename) return;

        try {
            const res = await fetch(`/api/albums/${targetAlbumForRename}/rename`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: newTitle })
            });

            if (!res.ok) throw new Error("Falha ao renomear");
            const data = await res.json();

            // Update in active sessions
            if (activeSessions.has(targetAlbumForRename)) {
                const s = activeSessions.get(targetAlbumForRename);
                s.title = data.title;
                if (s.cardEl) {
                    s.cardEl.querySelector(".album-title").innerText = data.title;
                }
                updateMultiAlbumNav();
            }

            const alb = allSavedAlbums.find(a => a.session_id === targetAlbumForRename);
            if (alb) alb.title = data.title;

            renderExplorerLibrary();
            closeRenameModal();
        } catch (err) {
            alert("Erro ao salvar nome: " + err.message);
        }
    });

    function openDeleteModal(sessionId, currentTitle) {
        targetAlbumForDelete = sessionId;
        deleteAlbumFilename.innerText = `${sessionId}.json`;
        deleteModal.classList.remove("hidden");
    }

    function closeDeleteModal() {
        deleteModal.classList.add("hidden");
        targetAlbumForDelete = null;
    }

    btnCancelDelete.addEventListener("click", closeDeleteModal);
    deleteModalOverlay.addEventListener("click", closeDeleteModal);

    btnConfirmDelete.addEventListener("click", async () => {
        if (!targetAlbumForDelete) return;

        try {
            const res = await fetch(`/api/albums/${targetAlbumForDelete}`, {
                method: "DELETE"
            });

            if (!res.ok) throw new Error("Falha ao excluir");

            // Remove from active sessions
            if (activeSessions.has(targetAlbumForDelete)) {
                const s = activeSessions.get(targetAlbumForDelete);
                if (s.cardEl) s.cardEl.remove();
                if (s.eventSource) s.eventSource.close();
                activeSessions.delete(targetAlbumForDelete);
                updateMultiAlbumNav();

                if (activeSessions.size === 0) {
                    emptyState.classList.remove("hidden");
                }
            }

            allSavedAlbums = allSavedAlbums.filter(a => a.session_id !== targetAlbumForDelete);
            updateLibraryBadge();
            renderExplorerLibrary();
            closeDeleteModal();
        } catch (err) {
            alert("Erro ao excluir álbum: " + err.message);
        }
    });

    // -------------------------------------------------------------
    // IMAGE COMPARATOR MODAL
    // -------------------------------------------------------------
    function openImageModal(imgData, referer) {
        modalImage.src = getProxyUrl(imgData.original_url || imgData.thumbnail_url, referer);
        modalMeta.innerHTML = `
            <div><strong>Position:</strong> #${imgData.position}</div>
            <div><strong>Dimensions:</strong> ${imgData.width || '?'} x ${imgData.height || '?'}</div>
            <div><strong>Original URL:</strong> <a href="${imgData.original_url || '#'}" target="_blank" class="lib-link">${imgData.original_url || 'Unresolved'}</a></div>
            <div><strong>Resolution Method:</strong> ${imgData.resolution_method}</div>
            <div><strong>Validation Status:</strong> ${imgData.validation_status}</div>
        `;
        imageModal.classList.remove("hidden");
    }

    function closeImageModal() {
        imageModal.classList.add("hidden");
    }

    modalClose.addEventListener("click", closeImageModal);
    modalOverlay.addEventListener("click", closeImageModal);
});
