/**
 * 📊 Enhanced Dashboard Manager
 * Professional dashboard with metrics, visualizations, and real-time updates
 */

class DashboardManager {
    constructor() {
        this.metrics = new Map();
        this.refreshInterval = null;
        this.updateInterval = 30000; // 30 seconds
        this.pendingWorkOrder = null;
        this.selectedPdfFile = null;

        // Config getters: config.json first, then localStorage fallback
        this.woCfg = {
            get gasUrl()    {
                return window.app?.config?.services?.activeJobs?.gasUrl
                    || localStorage.getItem('dr_gas_url')
                    || '';
            },
            get claudeKey() {
                return window.app?.config?.ai?.claudeApiKey
                    || localStorage.getItem('dr_claude_key')
                    || '';
            }
        };
    }

    async init() {
        // Render empty states immediately
        this.renderMetricsCards();
        this.renderJobCards();

        // Setup listeners first so navigation always works
        this.setupEventListeners();
        this.setupAddWoModal();
        this.setupAutoRefresh();

        // Load data in background (non-blocking)
        this.loadMetrics().then(() => {
            this.renderMetricsCards();
        }).catch(error => {
            console.warn('Failed to load metrics:', error);
        });

        this.loadActiveJobs().then(() => {
            this.renderJobCards();
        }).catch(error => {
            console.warn('Failed to load active jobs:', error);
        });

        this.checkWeather();
        this.loadActivityFeed();
    }

    /**
     * Load dashboard metrics from backend
     */
    async loadMetrics() {
        try {
            const api = window.app?.api;
            if (!api) {
                console.warn('API not available');
                return;
            }

            // Check if any endpoints are configured
            if (!this.hasConfiguredEndpoints()) {
                console.log('No endpoints configured - skipping metrics load');
                this.showSetupRequired();
                return;
            }

            // Load inventory metrics
            const inventory = await api.callGoogleScript('inventory', 'getInventoryReport', []);
            const lowStock = await api.callGoogleScript('inventory', 'checkLowStock', []);
            const fleetReport = await api.callGoogleScript('inventory', 'getFleetReport', []);

            this.metrics.set('inventory', this.parseInventoryMetrics(inventory));
            this.metrics.set('lowStock', lowStock);
            this.metrics.set('fleet', this.parseFleetMetrics(fleetReport));

        } catch (error) {
            // Only show error if it's not about missing endpoints
            if (!error.message.includes('No Google Apps Script endpoint')) {
                console.error('Failed to load metrics:', error);
                this.showError('Unable to load dashboard metrics');
            } else {
                console.log('Endpoints not configured yet');
                this.showSetupRequired();
            }
        }
    }

    /**
     * Parse inventory report into metrics
     */
    parseInventoryMetrics(report) {
        if (!report) return { total: 0, locations: 0, value: 0 };

        // Extract numbers from report text
        const totalMatch = report.match(/Total Items:\s*(\d+)/);
        const locationsMatch = report.match(/Locations:\s*(\d+)/);

        return {
            total: totalMatch ? parseInt(totalMatch[1]) : 0,
            locations: locationsMatch ? parseInt(locationsMatch[1]) : 0,
            value: 0 // Could be calculated if we had pricing data
        };
    }

    /**
     * Parse fleet report into metrics
     */
    parseFleetMetrics(report) {
        if (!report) return { total: 0, active: 0, maintenance: 0 };

        const totalMatch = report.match(/Total Fleet Size:\s*(\d+)/);
        const activeMatch = report.match(/Active:\s*(\d+)/);
        const maintenanceMatch = report.match(/In Maintenance:\s*(\d+)/);

        return {
            total: totalMatch ? parseInt(totalMatch[1]) : 0,
            active: activeMatch ? parseInt(activeMatch[1]) : 0,
            maintenance: maintenanceMatch ? parseInt(maintenanceMatch[1]) : 0
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // ACTIVE JOBS DASHBOARD
    // ═══════════════════════════════════════════════════════════════

    /**
     * Load active jobs — uses direct GAS fetch if dr_gas_url is configured,
     * otherwise falls back to legacy api.callGoogleScript path.
     */
    async loadActiveJobs() {
        try {
            const gasUrl = this.woCfg.gasUrl;
            if (gasUrl) {
                const res  = await fetch(gasUrl + '?action=getProgress', { cache: 'no-store' });
                const json = await res.json();
                if (!json.success) throw new Error(json.error || 'Server error');
                this.metrics.set('activeJobs', json.data || []);
                return;
            }

            // Fallback: legacy API path
            const api = window.app?.api;
            if (!api) {
                console.warn('API not available for jobs loading');
                return;
            }

            if (!this.hasConfiguredEndpoints()) {
                console.log('No endpoints configured - skipping jobs load');
                this.metrics.set('activeJobs', []);
                return;
            }

            const result = await api.callGoogleScript('inventory', 'getActiveJobs', []);
            const jobs = (result && result.jobs) ? result.jobs : (Array.isArray(result) ? result : []);
            this.metrics.set('activeJobs', jobs);

        } catch (error) {
            if (!error.message?.includes('No Google Apps Script endpoint')) {
                console.error('Failed to load active jobs:', error);
            }
            this.metrics.set('activeJobs', []);
        }
    }

    /**
     * Render job cards grid and update stats bar
     */
    renderJobCards() {
        const container = document.getElementById('jobCardsGrid');
        if (!container) {
            console.warn('Job cards container not found');
            return;
        }

        const jobs = this.metrics.get('activeJobs') || [];
        this.renderStatsBar(jobs);

        if (jobs.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <div class="empty-icon">📋</div>
                    <p>No active jobs</p>
                    <span class="empty-hint">Click "+ Add Work Order" above to get started</span>
                </div>`;
            container.setAttribute('aria-busy', 'false');
            return;
        }

        // Sort: in-progress first, then by WO number
        const sorted = [...jobs].sort((a, b) => {
            if (a.percentage > 0 && b.percentage === 0) return -1;
            if (b.percentage > 0 && a.percentage === 0) return  1;
            return String(a.woNumber).localeCompare(String(b.woNumber), undefined, { numeric: true });
        });

        container.innerHTML = '';
        sorted.forEach(job => container.appendChild(this.createJobCard(job)));
        container.setAttribute('aria-busy', 'false');
    }

    /**
     * Build a single job card DOM element (reference-style design)
     */
    createJobCard(job) {
        const pct = job.percentage ?? 0;
        const sc  = pct === 0 ? 'not-started' : (pct === 100 ? 'complete' : 'in-progress');
        const sl  = pct === 0 ? 'Not Started'  : (pct === 100 ? 'Complete'  : 'In Progress');
        const fc  = pct === 0 ? 'p-zero'        : (pct === 100 ? 'p-complete': 'p-partial');
        const client = this.getDetail(job, 'customerName', 'CustomerName', 'customer', 'Customer', 'client', 'Client', 'clientName', 'ClientName');

        const card = document.createElement('div');
        card.className = 'wo-card';
        card.setAttribute('role', 'listitem');
        card.innerHTML = `
            <div class="wo-card-header">
                <span class="wo-number">WO #${this.escapeHtml(String(job.woNumber || 'N/A'))}</span>
                <span class="wo-badge ${sc}">${sl}</span>
            </div>
            <div class="wo-job-name">${this.escapeHtml(job.jobName || '—')}</div>
            ${client ? `<div class="wo-client">${this.escapeHtml(client)}</div>` : ''}
            <div class="progress-track"><div class="progress-fill ${fc}" style="width:${pct}%"></div></div>
            <div class="wo-card-footer">
                <span class="wo-item-count">${job.completedItems ?? 0} / ${job.totalItems ?? 0} items</span>
                <span class="wo-pct ${fc}">${pct}%</span>
            </div>
            <div class="wo-details-hint">Tap for details →</div>`;

        card.addEventListener('click', () => this.openDetail(job.woNumber));
        return card;
    }

    /**
     * Update the stats bar with aggregate counts
     */
    renderStatsBar(jobs) {
        const totalItems = jobs.reduce((s, w) => s + (w.totalItems || 0), 0);
        const doneItems  = jobs.reduce((s, w) => s + (w.completedItems || 0), 0);
        const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('woStatActive', jobs.length);
        set('woStatItems',  totalItems);
        set('woStatDone',   doneItems);
        set('woStatPct',    pct + '%');
    }

    // ═══════════════════════════════════════════════════════════════
    // DETAIL MODAL
    // ═══════════════════════════════════════════════════════════════

    /**
     * Open the WO detail modal and load line items from GAS
     */
    async openDetail(woNumber) {
        const jobs = this.metrics.get('activeJobs') || [];
        const wo   = jobs.find(w => String(w.woNumber) === String(woNumber));
        if (!wo) return;

        const titleEl = document.getElementById('woDetailTitle');
        const bodyEl  = document.getElementById('woDetailBody');
        if (titleEl) titleEl.textContent = 'WO #' + wo.woNumber + ' — ' + (wo.jobName || '');
        if (bodyEl)  bodyEl.innerHTML    = '<div style="text-align:center;padding:40px"><div class="spinner" style="margin:auto;width:32px;height:32px;border-width:3px"></div></div>';

        document.getElementById('woDetailModal')?.classList.remove('hidden');

        const gasUrl = this.woCfg.gasUrl;
        if (!gasUrl) {
            if (bodyEl) bodyEl.innerHTML = '<div class="wo-parse-error">GAS URL not configured. Open Settings → Work Order Dashboard to add it.</div>';
            return;
        }

        try {
            const res  = await fetch(gasUrl + '?action=getLineItems&woNumber=' + encodeURIComponent(woNumber));
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Server error');
            this.renderDetailBody(wo, json.data || []);
        } catch (ex) {
            if (bodyEl) bodyEl.innerHTML = '<div class="wo-parse-error">' + this.escapeHtml(ex.message) + '</div>';
        }
    }

    /**
     * Render the detail modal body with meta chips, progress bar, and line items
     */
    renderDetailBody(wo, lineItems) {
        const bodyEl = document.getElementById('woDetailBody');
        if (!bodyEl) return;

        const pct = wo.percentage ?? 0;
        const fc  = pct === 0 ? 'p-zero' : (pct === 100 ? 'p-complete' : 'p-partial');

        let metaHtml = '';
        const detailClient  = this.getDetail(wo, 'customerName', 'CustomerName', 'customer', 'Customer', 'client', 'Client', 'clientName', 'ClientName');
        const detailAddress = this.getDetail(wo, 'address', 'Address', 'location', 'Location', 'Job Address', 'jobAddress', 'JobAddress');
        if (detailClient)  metaHtml += `<span>${this.escapeHtml(detailClient)}</span>`;
        if (detailAddress) metaHtml += `<span>${this.escapeHtml(detailAddress)}</span>`;
        if (wo.lastUpdated) metaHtml += `<span>Updated: ${this.escapeHtml(String(wo.lastUpdated))}</span>`;
        if (wo.hoursUsed)   metaHtml += `<span>Hours: ${this.escapeHtml(String(wo.hoursUsed))}</span>`;

        let itemsHtml = '';
        if (lineItems.length === 0) {
            itemsHtml = '<div style="color:var(--text-secondary);font-size:13px;padding:12px 0;">No line items found.</div>';
        } else {
            itemsHtml = '<div class="wo-line-items-list" id="woLineItemsList">';
            lineItems.forEach(item => {
                const done     = item._done;
                const lineNum  = item['lineNumber'] || item['line#'] || item['Line#'] || '';
                const itemName = item['itemName']   || item['Item'] || item['name'] || item['Name'] || '';
                const desc     = item['description'] || item['Description'] || '';
                const qty      = item['quantity']    || item['Quantity']    || '';
                const unit     = item['unit']        || item['Unit']        || '';
                const display  = [itemName, desc ? '— ' + desc : '', qty ? qty + ' ' + unit : ''].filter(Boolean).join(' ');
                itemsHtml += `
                    <div class="wo-line-item-row${done ? ' done' : ''}" data-row="${item._rowIndex}" data-wo="${this.escapeHtml(String(wo.woNumber))}" data-done="${done}">
                        <div class="wo-li-checkbox">${done ? '✓' : ''}</div>
                        ${lineNum ? `<span class="wo-li-num-badge">${this.escapeHtml(String(lineNum))}</span>` : ''}
                        <div class="wo-li-text">${this.escapeHtml(display || 'Item ' + item._rowIndex)}</div>
                        <div class="wo-li-saving hidden"><span class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block"></span></div>
                    </div>`;
            });
            itemsHtml += '</div>';
        }

        bodyEl.innerHTML = `
            ${metaHtml ? `<div class="wo-detail-meta">${metaHtml}</div>` : ''}
            <div class="wo-detail-progress-row">
                <div class="progress-track" style="flex:1;height:8px"><div class="progress-fill ${fc}" style="width:${pct}%"></div></div>
                <span class="wo-detail-pct">${pct}%</span>
            </div>
            <div class="wo-section-label">Line Items (${wo.completedItems ?? 0}/${wo.totalItems ?? 0} done)</div>
            ${itemsHtml}`;

        bodyEl.querySelectorAll('.wo-line-item-row').forEach(row => {
            row.addEventListener('click', () => this.toggleCheckbox(row));
        });
    }

    /**
     * Toggle a line item checkbox and POST the update to GAS
     */
    async toggleCheckbox(row) {
        const woNumber = row.dataset.wo;
        const rowIndex = parseInt(row.dataset.row);
        const newValue = row.dataset.done !== 'true';
        const gasUrl   = this.woCfg.gasUrl;
        if (!gasUrl) return;

        row.dataset.done = String(newValue);
        row.classList.toggle('done', newValue);
        const cbEl     = row.querySelector('.wo-li-checkbox');
        const savingEl = row.querySelector('.wo-li-saving');
        if (cbEl)     cbEl.textContent = newValue ? '✓' : '';
        if (savingEl) savingEl.classList.remove('hidden');

        try {
            await fetch(gasUrl, {
                method: 'POST',
                mode:   'no-cors',
                body:   JSON.stringify({ action: 'toggleCheckbox', woNumber, rowIndex, value: newValue })
            });
            setTimeout(async () => {
                await this.loadActiveJobs();
                this.renderJobCards();
                if (!document.getElementById('woDetailModal')?.classList.contains('hidden')) {
                    this.openDetail(woNumber);
                }
            }, 1500);
        } catch (ex) {
            // Revert on error
            row.dataset.done = String(!newValue);
            row.classList.toggle('done', !newValue);
            if (cbEl) cbEl.textContent = !newValue ? '✓' : '';
            this.showToast('Save failed — ' + ex.message, 'error');
        } finally {
            if (savingEl) savingEl.classList.add('hidden');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ADD WORK ORDER MODAL
    // ═══════════════════════════════════════════════════════════════

    /**
     * Wire up the "Add Work Order" button and the legacy PDF drop zone
     */
    setupAddWoModal() {
        // Legacy PDF drop zone → now opens the new modal
        const dropZone = document.getElementById('pdfUploadZone');
        if (dropZone) {
            dropZone.addEventListener('click', () => this.openWoModal());
            dropZone.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openWoModal(); }
            });
        }

        // Section-header button
        document.getElementById('addWoBtn')?.addEventListener('click', () => this.openWoModal());
    }

    /** Open the Add WO modal in a clean state */
    openWoModal() {
        const rawInput = document.getElementById('woRawInput');
        if (rawInput) rawInput.value = '';
        document.getElementById('woParsedPreview')?.classList.add('hidden');
        document.getElementById('woBtnConfirmAdd')?.classList.add('hidden');
        document.getElementById('woParseError')?.classList.add('hidden');
        document.getElementById('woParseSpinner')?.classList.add('hidden');
        const tbody = document.getElementById('woLiTbody');
        if (tbody) tbody.innerHTML = '';
        const liCount = document.getElementById('woLiCount');
        if (liCount) liCount.textContent = '0';
        this.resetPdfDropzone();
        this.setInputMode('pdf');
        document.getElementById('addWoModal')?.classList.remove('hidden');
    }

    /** Switch between PDF and text input tabs */
    setInputMode(mode) {
        document.getElementById('woPdfMode')?.classList.toggle('hidden', mode !== 'pdf');
        document.getElementById('woTextMode')?.classList.toggle('hidden', mode !== 'text');
        document.getElementById('woTabPdf')?.classList.toggle('active',  mode === 'pdf');
        document.getElementById('woTabText')?.classList.toggle('active', mode === 'text');
    }

    /** Handle a file selected from the dropzone */
    handleFileSelect(file) {
        if (!file) return;
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            this.showToast('Please select a PDF file.', 'warning');
            return;
        }
        this.selectedPdfFile = file;
        document.getElementById('woPdfDropzone')?.classList.add('has-file');
        const iconEl  = document.getElementById('woDzIcon');
        const labelEl = document.getElementById('woDzLabel');
        const hintEl  = document.getElementById('woDzHint');
        if (iconEl)  iconEl.textContent  = '✅';
        if (labelEl) labelEl.textContent = file.name;
        if (hintEl)  hintEl.textContent  = (file.size / 1024).toFixed(0) + ' KB — click Parse with AI to extract';
    }

    /** Reset the PDF dropzone to its empty state */
    resetPdfDropzone() {
        this.selectedPdfFile = null;
        const dz = document.getElementById('woPdfDropzone');
        if (dz) dz.classList.remove('has-file', 'drag-over');
        const iconEl    = document.getElementById('woDzIcon');
        const labelEl   = document.getElementById('woDzLabel');
        const hintEl    = document.getElementById('woDzHint');
        const fileInput = document.getElementById('woFileInput');
        if (iconEl)    iconEl.textContent  = '📄';
        if (labelEl)   labelEl.textContent = 'Drop PDF here or click to browse';
        if (hintEl)    hintEl.textContent  = 'Deep Roots work order PDFs — all fields extracted automatically';
        if (fileInput) fileInput.value     = '';
    }

    /** Read a file as a base64 string (without the data: prefix) */
    readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Call the Anthropic API directly to parse a PDF or text description
     * into a structured work order JSON
     */
    async parseWithClaude() {
        const claudeKey = this.woCfg.claudeKey;
        if (!claudeKey) {
            this.showParseError('Claude API key not set — open Settings → Work Order Dashboard to add it.');
            return;
        }

        const isPdf   = !document.getElementById('woPdfMode')?.classList.contains('hidden');
        const rawText = document.getElementById('woRawInput')?.value.trim() || '';
        if (isPdf && !this.selectedPdfFile) { this.showParseError('Please select a PDF file first.'); return; }
        if (!isPdf && !rawText)             { this.showParseError('Please enter a work order description.'); return; }

        document.getElementById('woParseSpinner')?.classList.remove('hidden');
        const parseBtn = document.getElementById('woBtnParse');
        if (parseBtn) parseBtn.disabled = true;
        document.getElementById('woParseError')?.classList.add('hidden');
        document.getElementById('woParsedPreview')?.classList.add('hidden');
        document.getElementById('woBtnConfirmAdd')?.classList.add('hidden');

        const instruction = `You are extracting data from a Deep Roots Landscape LLC work order. Follow these EXACT rules:

WORK ORDER HEADER:
- woNumber: Numbers only (from "Work Order #XXXXX" — strip the # and any letters)
- jobName: Exact text from the "Job:" field
- client: Exact text from the "Client:" field
- category: Infer ONLY from the client name:
    * Personal name (e.g. "Steve Willis", "Mary Page") → "Residential"
    * LLC / Inc / Company / Clinic / Electric → "Commercial"
    * HOA / Association → "HOA"
    * Church / School / Government → "Institutional"
- status: From "Tags" section only (e.g. "Procurement in Process"). LEAVE BLANK if no tags.
- address: From the "Location" field. Format as: Street City State Zip — NO COMMAS, NO punctuation
- jobNotes: From "Crew Notes" section. Leave blank if empty.
- salesRep: First name only from "Sales Reps" or "From:" field (e.g. "Nathan" not "Nathan Howle")

LINE ITEMS — numbered rows from the item table:
- lineNumber: THE ORIGINAL NUMBER from the PDF exactly (do NOT renumber — gaps like 1,2,5,7 are normal)
- itemName: Item title. Remove trailing size/spec if it repeats in description.
- description: Item details. REMOVE ALL COMMAS. Combine multi-line text into ONE line. Keep concise.
- quantity: Numeric only (can be decimal, can be negative for credits). Strip all text.
- unit: Pick EXACTLY one from this list: Man Hours | Ea. | Yards | Pallet | Tons | LF | Sq. Ft. | Bags | Flat | Weeks | Days | Zones | Lbs | Bales
    Unit examples: "6 Man Hours" → 6 / Man Hours | "3" (plants/items) → 3 / Ea. | "15 Bales" → 15 / Bales | "1 Ton" → 1 / Tons

INCLUDE all items — INCLUDING "Unknown Circumstances", "Unforeseen Circumstances", "Watering Trees/Plants/Sod" (quantity 1, unit Ea.).

RESPOND with ONLY a valid JSON object — no markdown, no explanation:
{"woNumber":"","jobName":"","client":"","category":"","status":"","address":"","jobNotes":"","salesRep":"","lineItems":[{"lineNumber":1,"itemName":"","description":"","quantity":1,"unit":"Ea."}]}`;

        try {
            let content;
            if (isPdf) {
                const b64 = await this.readFileAsBase64(this.selectedPdfFile);
                content = [
                    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
                    { type: 'text', text: instruction }
                ];
            } else {
                content = instruction + '\n\nWork order text:\n"""\n' + rawText + '\n"""';
            }

            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'content-type':                              'application/json',
                    'x-api-key':                                 claudeKey,
                    'anthropic-version':                         '2023-06-01',
                    'anthropic-beta':                            'pdfs-2024-09-25',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model:      isPdf ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001',
                    max_tokens: 2048,
                    messages:   [{ role: 'user', content }]
                })
            });

            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                throw new Error(e.error?.message || 'API error ' + res.status);
            }

            const apiData    = await res.json();
            const rawContent = apiData.content[0].text.trim();
            const jsonMatch  = rawContent.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('Could not find JSON in Claude response.');
            const parsed = JSON.parse(jsonMatch[0]);

            this.populateParsedPreview(parsed);

        } catch (ex) {
            this.showParseError(ex.message);
            console.error('Claude parse error:', ex);
        } finally {
            document.getElementById('woParseSpinner')?.classList.add('hidden');
            if (parseBtn) parseBtn.disabled = false;
        }
    }

    /** Populate the parsed preview form with Claude's extracted data */
    populateParsedPreview(data) {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        set('pfWonumber', data.woNumber);
        set('pfJobname',  data.jobName);
        set('pfClient',   data.client);
        set('pfStatus',   data.status);
        set('pfAddress',  data.address);
        set('pfJobnotes', data.jobNotes);
        set('pfSalesrep', data.salesRep);

        const catSel = document.getElementById('pfCategory');
        if (catSel) {
            const cat = data.category || 'Residential';
            [...catSel.options].forEach(o => { o.selected = o.value === cat; });
        }

        const tbody = document.getElementById('woLiTbody');
        if (tbody) tbody.innerHTML = '';
        (data.lineItems || []).forEach(item => this.addLineItemRow(item));

        document.getElementById('woParsedPreview')?.classList.remove('hidden');
        document.getElementById('woBtnConfirmAdd')?.classList.remove('hidden');
        this.updateLiCount();
    }

    /** Add an editable row to the line items table */
    addLineItemRow(item) {
        item = item || {};
        const tbody = document.getElementById('woLiTbody');
        if (!tbody) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="wo-li-num-cell"><input class="wo-li-input" style="width:36px;text-align:center" value="${this.escapeHtml(String(item.lineNumber ?? ''))}" placeholder="#"></td>
            <td><input class="wo-li-input" value="${this.escapeHtml(item.itemName || '')}" placeholder="Item name"></td>
            <td><input class="wo-li-input" value="${this.escapeHtml(item.description || '')}" placeholder="Description (no commas)"></td>
            <td><input class="wo-li-input wo-qty-input" type="number" value="${this.escapeHtml(String(item.quantity ?? ''))}" placeholder="1" step="0.5"></td>
            <td><input class="wo-li-input wo-unit-input" list="woUnitOptions" value="${this.escapeHtml(item.unit || 'Ea.')}" placeholder="Unit"></td>
            <td><button class="wo-btn-del-li" onclick="this.closest('tr').remove();window.app?.dashboard?.updateLiCount()" aria-label="Remove row">✕</button></td>`;
        tbody.appendChild(tr);
        this.updateLiCount();
    }

    /** Keep the line item count badge in sync */
    updateLiCount() {
        const count = document.getElementById('woLiTbody')?.querySelectorAll('tr').length || 0;
        const el    = document.getElementById('woLiCount');
        if (el) el.textContent = count;
    }

    /**
     * Confirm and POST the new work order to GAS
     */
    async confirmAddWO() {
        const gasUrl  = this.woCfg.gasUrl;
        if (!gasUrl) {
            this.showToast('GAS URL not configured — open Settings to add it.', 'error');
            return;
        }

        const woNumber = document.getElementById('pfWonumber')?.value.trim() || '';
        const jobName  = document.getElementById('pfJobname')?.value.trim()  || '';
        if (!woNumber) { this.showToast('WO Number is required.', 'error'); return; }
        if (!jobName)  { this.showToast('Job Name is required.',  'error'); return; }

        const currentJobs = this.metrics.get('activeJobs') || [];
        if (currentJobs.some(w => String(w.woNumber).trim() === woNumber)) {
            this.showToast('WO #' + woNumber + ' already exists.', 'error');
            return;
        }

        const rows = document.getElementById('woLiTbody')?.querySelectorAll('tr') || [];
        const lineItems = Array.from(rows).map(tr => {
            const inputs = tr.querySelectorAll('input');
            return {
                lineNumber:  inputs[0]?.value.trim() || '',
                itemName:    inputs[1]?.value.trim() || '',
                description: inputs[2]?.value.trim() || '',
                quantity:    parseFloat(inputs[3]?.value) || 1,
                unit:        inputs[4]?.value.trim() || 'Ea.'
            };
        }).filter(i => i.itemName);

        const data = {
            woNumber,
            jobName,
            client:   document.getElementById('pfClient')?.value.trim()   || '',
            category: document.getElementById('pfCategory')?.value         || 'Residential',
            status:   document.getElementById('pfStatus')?.value.trim()   || '',
            address:  document.getElementById('pfAddress')?.value.trim()  || '',
            jobNotes: document.getElementById('pfJobnotes')?.value.trim() || '',
            salesRep: document.getElementById('pfSalesrep')?.value.trim() || '',
            lineItems
        };

        const spinner = document.getElementById('woAddSpinner');
        const btn     = document.getElementById('woBtnConfirmAdd');
        if (spinner) spinner.classList.remove('hidden');
        if (btn)     btn.disabled = true;

        try {
            await fetch(gasUrl, {
                method: 'POST',
                mode:   'no-cors',
                body:   JSON.stringify({ action: 'addWorkOrder', data })
            });
            document.getElementById('addWoModal')?.classList.add('hidden');
            this.showToast('WO #' + woNumber + ' queued — refreshing in 2s…', 'success');
            setTimeout(async () => {
                await this.loadActiveJobs();
                this.renderJobCards();
            }, 2000);
        } catch (ex) {
            this.showToast('Failed: ' + ex.message, 'error');
        } finally {
            if (spinner) spinner.classList.add('hidden');
            if (btn)     btn.disabled = false;
        }
    }

    /** Display a parse error message in the Add WO modal */
    showParseError(msg) {
        const el = document.getElementById('woParseError');
        if (el) {
            el.textContent = msg;
            el.classList.remove('hidden');
        }
    }

    /**
     * Case-insensitive key lookup: checks top-level wo properties first, then wo.details
     */
    getDetail(wo, ...keys) {
        // Check top-level properties first (e.g. job.client set on add or returned by GAS)
        for (const k of keys) {
            if (wo[k] && typeof wo[k] === 'string') return wo[k];
        }
        const normKeys = keys.map(k => k.toLowerCase().replace(/[\s_]+/g, ''));
        for (const [k, v] of Object.entries(wo)) {
            if (k === 'details' || !v || typeof v !== 'string') continue;
            const normK = String(k).toLowerCase().replace(/[\s_]+/g, '');
            if (normKeys.includes(normK)) return v;
        }
        // Then check wo.details
        if (!wo.details) return '';
        for (const k of keys) {
            if (wo.details[k]) return wo.details[k];
        }
        for (const [k, v] of Object.entries(wo.details)) {
            const normK = String(k).toLowerCase().replace(/[\s_]+/g, '');
            if (v && normKeys.includes(normK)) return v;
        }
        return '';
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ═══════════════════════════════════════════════════════════════
    // METRICS CARDS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Render metrics cards on dashboard
     */
    renderMetricsCards() {
        const container = document.getElementById('metricsGrid');
        if (!container) {
            console.warn('Metrics container not found');
            return;
        }

        const inventory = this.metrics.get('inventory') || { total: 0, locations: 0 };
        const lowStock = this.metrics.get('lowStock') || [];
        const fleet = this.metrics.get('fleet') || { total: 0, active: 0, maintenance: 0 };

        const cards = [
            {
                icon: '🌱',
                label: 'Total Inventory Items',
                value: inventory.total,
                change: null,
                status: 'success'
            },
            {
                icon: '⚠️',
                label: 'Low Stock Items',
                value: lowStock.length || 0,
                change: lowStock.length > 0 ? { value: lowStock.length, positive: false } : null,
                status: lowStock.length > 5 ? 'error' : 'warning'
            },
            {
                icon: '📍',
                label: 'Storage Locations',
                value: inventory.locations,
                change: null,
                status: 'info'
            },
            {
                icon: '🚛',
                label: 'Active Vehicles',
                value: `${fleet.active}/${fleet.total}`,
                change: fleet.maintenance > 0 ? { value: fleet.maintenance, positive: false } : null,
                status: fleet.maintenance > 0 ? 'warning' : 'success'
            }
        ];

        container.innerHTML = cards.map(card => this.createMetricCard(card)).join('');
    }

    /**
     * Create a metric card HTML
     */
    createMetricCard({ icon, label, value, change, status }) {
        const changeHTML = change ? `
            <div class="metric-change ${change.positive ? 'positive' : 'negative'}">
                <span>${change.positive ? '↑' : '↓'}</span>
                <span>${change.value}</span>
            </div>
        ` : '';

        return `
            <div class="metric-card ${status}" data-metric="${label}">
                <div class="metric-header">
                    <div class="metric-info">
                        <div class="metric-value">${value}</div>
                        <div class="metric-label">${label}</div>
                        ${changeHTML}
                    </div>
                    <div class="metric-icon ${status}">${icon}</div>
                </div>
            </div>
        `;
    }

    /**
     * Setup auto-refresh for metrics
     */
    setupAutoRefresh() {
        this.refreshInterval = setInterval(async () => {
            await this.loadMetrics();
            this.renderMetricsCards();
            await this.loadActiveJobs();
            this.renderJobCards();
        }, this.updateInterval);

        this.weatherInterval = setInterval(() => this.checkWeather(), 30 * 60 * 1000);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Refresh button
        const refreshBtn = document.getElementById('refreshMetrics');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                await this.loadMetrics();
                this.renderMetricsCards();
                this.showToast('Dashboard refreshed', 'success');
                setTimeout(() => refreshBtn.disabled = false, 2000);
            });
        }

        // Metric card clicks
        document.addEventListener('click', (e) => {
            const card = e.target.closest('.metric-card');
            if (card) {
                const metric = card.dataset.metric;
                this.handleMetricClick(metric);
            }
        });
    }

    /**
     * Handle metric card click
     */
    handleMetricClick(metric) {
        console.log('Metric clicked:', metric);
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        if (window.app?.ui) {
            window.app.ui.showNotification(message, type);
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        this.showToast(message, 'error');
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }

    /**
     * Check Open-Meteo for freeze/heat/storm alerts and update the banner
     */
    async checkWeather() {
        const banner = document.getElementById('weatherAlertBanner');
        if (!banner) return;

        try {
            const url = 'https://api.open-meteo.com/v1/forecast?latitude=34.2979&longitude=-83.8241' +
                '&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,weather_code' +
                '&temperature_unit=fahrenheit&forecast_days=3&timezone=America%2FNew_York';

            const res = await fetch(url);
            if (!res.ok) throw new Error('Weather fetch failed: ' + res.status);
            const data = await res.json();

            const mins  = data.daily.temperature_2m_min        || [];
            const maxes = data.daily.temperature_2m_max        || [];
            const feels = data.daily.apparent_temperature_max  || [];
            const codes = data.daily.weather_code              || [];

            const alerts = [];
            let bannerType = '';

            // Freeze check — any of next 3 days at or below 32°F
            if (mins.some(t => t <= 32)) {
                const low = Math.min(...mins).toFixed(0);
                alerts.push('FREEZE WARNING: Low of ' + low + '°F forecast — protect equipment & plants');
                bannerType = 'freeze';
            }

            // Heat check — apparent temp ≥ 100 OR actual ≥ 95
            if (feels.some(t => t >= 100) || maxes.some(t => t >= 95)) {
                const hi = Math.max(...feels).toFixed(0);
                alerts.push('HEAT ADVISORY: Feels like ' + hi + '°F — hydration breaks required');
                if (!bannerType) bannerType = 'heat';
            }

            // Storm check — weather code ≥ 95 (thunderstorm)
            if (codes.some(c => c >= 95)) {
                alerts.push('STORM ALERT: Thunderstorms in forecast — review outdoor schedule');
                if (!bannerType) bannerType = 'storm';
            }

            if (alerts.length > 0) {
                banner.className = 'weather-alert-banner ' + bannerType;
                banner.innerHTML = alerts.map(a => '<span class="weather-alert-msg">&#9888; ' + a + '</span>').join('');
                // Also show toast for immediate attention
                const ui = window.app?.ui;
                if (ui) alerts.forEach(a => ui.showNotification(a, 'warning'));
            } else {
                banner.className = 'weather-alert-banner';
                banner.innerHTML = '';
            }
        } catch (err) {
            console.warn('Weather check failed:', err);
        }
    }

    async loadActivityFeed() {
        // getRecentActivity lives in the Clippings/inventory GAS (doPost uses function/parameters keys)
        const gasUrl = window.app?.config?.services?.inventory?.url;
        if (!gasUrl) return;

        try {
            const res = await fetch(gasUrl, {
                method: 'POST',
                body: JSON.stringify({ function: 'getRecentActivity', parameters: [10] })
            });
            const json = await res.json();
            if (!json.success) return;

            const activities = Array.isArray(json.response) ? json.response : [];
            this.renderActivityFeed(activities);

            const ts = document.getElementById('activityFeedTimestamp');
            if (ts) ts.textContent = 'Updated ' + new Date().toLocaleTimeString();
        } catch (e) {
            console.warn('Activity feed load failed:', e);
        }
    }

    renderActivityFeed(activities) {
        const list = document.getElementById('activityFeedList');
        if (!list) return;

        if (!activities.length) {
            list.innerHTML = '<div class="activity-placeholder">No recent activity.</div>';
            return;
        }

        list.innerHTML = activities.map(a => {
            const time = a.timestamp
                ? new Date(a.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                : '';
            const actionClass = (a.action || '').toLowerCase().includes('singleops') ? 'activity-singleops' : '';
            return `<div class="activity-entry ${actionClass}">
      <span class="activity-action">${this.escapeHtml(a.action || '')}</span>
      <span class="activity-item">${this.escapeHtml(a.itemName || '')}</span>
      ${a.details ? `<span class="activity-details">${this.escapeHtml(a.details)}</span>` : ''}
      <span class="activity-time">${time}</span>
    </div>`;
        }).join('');
    }

    /**
     * Check if any endpoints are configured
     */
    hasConfiguredEndpoints() {
        const config = window.app?.config?.services;
        if (!config) return false;

        const services = ['inventory', 'grading', 'scheduler', 'tools'];
        return services.some(service => {
            const url = config[service]?.url;
            return url && url.trim() !== '';
        });
    }

    /**
     * Show setup required message
     */
    showSetupRequired() {
        const metricsGrid = document.querySelector('.metrics-grid');
        if (metricsGrid) {
            metricsGrid.innerHTML = `
                <div class="setup-required" style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: var(--bg-secondary, #f8f9fa); border-radius: 12px; margin: 20px 0;">
                    <div style="font-size: 64px; margin-bottom: 20px;">🧙‍♂️</div>
                    <h2 style="margin: 0 0 12px; color: var(--text-primary, #333);">Setup Required</h2>
                    <p style="color: var(--text-secondary, #666); margin-bottom: 24px; max-width: 500px; margin-left: auto; margin-right: auto;">
                        To see dashboard metrics and connect to your tools, you need to configure external connections.
                    </p>
                    <button
                        class="btn btn-primary"
                        onclick="document.getElementById('settingsBtn')?.click()"
                        style="padding: 12px 32px; font-size: 16px; cursor: pointer;"
                    >
                        ⚙️ Open Settings & Run Setup Wizard
                    </button>
                    <p style="color: var(--text-secondary, #888); margin-top: 16px; font-size: 14px;">
                        Or continue using the chat interface without external tools
                    </p>
                </div>
            `;
        }
    }
}

/**
 * 🔔 Toast Notification System
 */
class ToastManager {
    constructor() {
        this.container = null;
        this.toasts = new Map();
        this.defaultDuration = 5000;
        this.init();
    }

    init() {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    }

    show(message, type = 'info', duration = this.defaultDuration) {
        const id = Date.now();
        const toast = this.createToast(id, message, type);
        this.container.appendChild(toast);
        this.toasts.set(id, toast);
        setTimeout(() => this.remove(id), duration);
        return id;
    }

    createToast(id, message, type) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.dataset.toastId = id;

        const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-content">
                <div class="toast-message">${this.escapeHtml(message)}</div>
            </div>
            <button class="toast-close" onclick="window.toastManager.remove(${id})">×</button>
        `;
        return toast;
    }

    remove(id) {
        const toast = this.toasts.get(id);
        if (toast) {
            toast.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => { toast.remove(); this.toasts.delete(id); }, 300);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    success(message) { return this.show(message, 'success'); }
    error(message)   { return this.show(message, 'error'); }
    warning(message) { return this.show(message, 'warning'); }
    info(message)    { return this.show(message, 'info'); }
}

/**
 * 📈 Data Visualization Helper
 */
class ChartHelper {
    static createBarChart(data, container) {
        const max = Math.max(...data.map(d => d.value));
        const html = data.map(item => {
            const percentage = (item.value / max) * 100;
            return `
                <div class="chart-bar">
                    <div class="chart-bar-label">${item.label}</div>
                    <div class="chart-bar-container">
                        <div class="chart-bar-fill" style="width: ${percentage}%">
                            <span class="chart-bar-value">${item.value}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        container.innerHTML = html;
    }

    static createDonutData(data) {
        const total = data.reduce((sum, item) => sum + item.value, 0);
        let currentAngle = 0;
        return data.map(item => {
            const percentage = (item.value / total) * 100;
            const angle = (item.value / total) * 360;
            const segment = {
                ...item,
                percentage: percentage.toFixed(1),
                startAngle: currentAngle,
                endAngle: currentAngle + angle
            };
            currentAngle += angle;
            return segment;
        });
    }
}

// Initialize toast manager globally
window.toastManager = new ToastManager();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DashboardManager, ToastManager, ChartHelper };
}
