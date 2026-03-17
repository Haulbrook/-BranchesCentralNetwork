/**
 * Native Inventory View — replaces the GAS iframe for inventory
 * Calls the same GAS backend via fetch (through api.js callGoogleScript)
 * so it works without Google sign-in.
 */
class InventoryView {
    constructor() {
        this.container = null;
        this.items = [];
        this.sortColumn = null;
        this.sortAsc = true;
        this.filterQuery = '';
        this.activeTab = 'search';
        this.isLoading = false;
        this._searchRequestId = 0;
    }

    /** Mount into a DOM element */
    mount(el) {
        this.container = el;
        this.render();
        this.bindEvents();
    }

    unmount() {
        this.container = null;
    }

    // ── Render ──────────────────────────────────────────

    render() {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="inv-app">
                <div class="inv-header">
                    <div class="inv-brand">
                        <span class="inv-brand-title">DEEP ROOTS</span>
                        <span class="inv-brand-sub">Clippings Inventory</span>
                    </div>
                    <nav class="inv-tabs" role="tablist">
                        <button class="inv-tab active" data-tab="search" role="tab" aria-selected="true">Search Inventory</button>
                        <button class="inv-tab" data-tab="browse" role="tab" aria-selected="false">Browse All</button>
                        <button class="inv-tab" data-tab="update" role="tab" aria-selected="false">Update Inventory</button>
                    </nav>
                </div>

                <div class="inv-body">
                    <!-- Search Tab -->
                    <div class="inv-panel" id="invPanelSearch">
                        <p class="inv-hint">Ask about inventory items, quantities, locations, or general landscaping questions</p>
                        <div class="inv-search-row">
                            <input type="text" id="invSearchInput" class="inv-input"
                                   placeholder="Try: 'Do we have hydrangeas?' or 'Where is the fertilizer?'"
                                   autocomplete="off">
                            <button class="inv-btn inv-btn-primary" id="invSearchBtn">Search</button>
                        </div>
                        <div id="invSearchResults" class="inv-results"></div>
                    </div>

                    <!-- Browse Tab -->
                    <div class="inv-panel hidden" id="invPanelBrowse">
                        <div class="inv-browse-toolbar">
                            <input type="text" id="invBrowseFilter" class="inv-input inv-input-sm"
                                   placeholder="Filter items...">
                            <span id="invBrowseCount" class="inv-count"></span>
                        </div>
                        <div id="invBrowseTable" class="inv-table-wrap">
                            <p class="inv-hint">Click "Browse All" above to load inventory</p>
                        </div>
                    </div>

                    <!-- Update Tab -->
                    <div class="inv-panel hidden" id="invPanelUpdate">
                        <p class="inv-hint">Update inventory quantities and details. Search for an item first, then modify.</p>
                        <div class="inv-search-row">
                            <input type="text" id="invUpdateSearch" class="inv-input"
                                   placeholder="Search for item to update..."
                                   autocomplete="off">
                            <button class="inv-btn inv-btn-primary" id="invUpdateSearchBtn">Find</button>
                        </div>
                        <div id="invUpdateResults" class="inv-results"></div>
                    </div>
                </div>
            </div>
        `;
    }

    bindEvents() {
        if (!this.container) return;

        // Tab switching
        this.container.querySelectorAll('.inv-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Search
        const searchInput = this.container.querySelector('#invSearchInput');
        const searchBtn = this.container.querySelector('#invSearchBtn');
        searchBtn?.addEventListener('click', () => this.doSearch(searchInput.value));
        searchInput?.addEventListener('keydown', e => {
            if (e.key === 'Enter') this.doSearch(searchInput.value);
        });

        // Browse filter
        const browseFilter = this.container.querySelector('#invBrowseFilter');
        browseFilter?.addEventListener('input', () => this.applyBrowseFilter(browseFilter.value));

        // Update search
        const updateSearch = this.container.querySelector('#invUpdateSearch');
        const updateSearchBtn = this.container.querySelector('#invUpdateSearchBtn');
        updateSearchBtn?.addEventListener('click', () => this.doSearch(updateSearch.value, 'update'));
        updateSearch?.addEventListener('keydown', e => {
            if (e.key === 'Enter') this.doSearch(updateSearch.value, 'update');
        });
    }

    switchTab(tabId) {
        this.activeTab = tabId;

        // Update tab buttons
        this.container.querySelectorAll('.inv-tab').forEach(t => {
            const isActive = t.dataset.tab === tabId;
            t.classList.toggle('active', isActive);
            t.setAttribute('aria-selected', isActive);
        });

        // Show/hide panels
        this.container.querySelector('#invPanelSearch')?.classList.toggle('hidden', tabId !== 'search');
        this.container.querySelector('#invPanelBrowse')?.classList.toggle('hidden', tabId !== 'browse');
        this.container.querySelector('#invPanelUpdate')?.classList.toggle('hidden', tabId !== 'update');

        // Auto-load browse on first visit
        if (tabId === 'browse' && this.items.length === 0) {
            this.loadBrowse();
        }

        // Focus the relevant input
        if (tabId === 'search') {
            this.container.querySelector('#invSearchInput')?.focus();
        } else if (tabId === 'update') {
            this.container.querySelector('#invUpdateSearch')?.focus();
        }
    }

    // ── API Calls ───────────────────────────────────────

    async doSearch(query, target = 'search') {
        query = (query || '').trim();
        if (!query) return;

        const resultsEl = target === 'search'
            ? this.container.querySelector('#invSearchResults')
            : this.container.querySelector('#invUpdateResults');
        if (!resultsEl) return;

        // Track request ID to discard stale results from overlapping searches
        const requestId = ++this._searchRequestId;

        resultsEl.innerHTML = '<div class="inv-loading"><div class="inv-spinner"></div> Searching...</div>';

        try {
            const api = window.app?.api;
            if (!api) throw new Error('API not available');

            const result = await api.searchInventory(query);
            if (requestId !== this._searchRequestId) return; // Stale — newer search in flight
            const data = result?.response || result;

            if (target === 'update') {
                this.renderUpdateResults(resultsEl, data, query);
            } else {
                this.renderSearchResults(resultsEl, data, query);
            }
        } catch (err) {
            if (requestId !== this._searchRequestId) return;
            Logger.error('Inventory', 'Inventory search failed:', err);
            resultsEl.innerHTML = `<div class="inv-error">Search failed: ${this.esc(err.message)}</div>`;
        }
    }

    async loadBrowse() {
        if (this.isLoading) return;
        this.isLoading = true;

        const tableEl = this.container.querySelector('#invBrowseTable');
        const countEl = this.container.querySelector('#invBrowseCount');
        if (!tableEl) { this.isLoading = false; return; }

        tableEl.innerHTML = '<div class="inv-loading"><div class="inv-spinner"></div> Loading inventory...</div>';

        try {
            const api = window.app?.api;
            if (!api) throw new Error('API not available');

            const result = await api.browseInventory();
            const data = result?.response || result;
            this.items = data?.items || [];

            countEl.textContent = `${this.items.length} items`;
            this.renderBrowseTable(tableEl);
        } catch (err) {
            Logger.error('Inventory', 'Browse inventory failed:', err);
            tableEl.innerHTML = `<div class="inv-error">Failed to load inventory: ${this.esc(err.message)}</div>`;
        } finally {
            this.isLoading = false;
        }
    }

    async doUpdate(itemData) {
        try {
            const api = window.app?.api;
            if (!api) throw new Error('API not available');

            await api.updateInventory(itemData);
            window.app?.ui?.showNotification('Inventory updated successfully', 'success');

            // Refresh browse if loaded
            if (this.items.length > 0) this.loadBrowse();
        } catch (err) {
            Logger.error('Inventory', 'Update failed:', err);
            window.app?.ui?.showNotification('Update failed: ' + err.message, 'error');
        }
    }

    // ── Renderers ───────────────────────────────────────

    renderSearchResults(el, data, query) {
        if (!data) {
            el.innerHTML = '<div class="inv-empty">No results found.</div>';
            return;
        }

        // The GAS askInventory returns { answer, source, success }
        const answer = data.answer || data;

        // If it returned structured items
        if (Array.isArray(answer)) {
            this.renderItemsList(el, answer);
            return;
        }

        if (typeof answer === 'string') {
            // Try to parse the text answer into structured item cards
            const parsed = this.parseAnswerToItems(answer);
            if (parsed.items.length > 0) {
                this.renderItemCards(el, parsed.items, parsed.header, query);
                return;
            }

            // Fallback: render as formatted text
            el.innerHTML = `
                <div class="inv-result-card">
                    <div class="inv-result-query">Results for: <strong>${this.esc(query)}</strong></div>
                    <div class="inv-result-body">${this.formatAnswer(answer)}</div>
                </div>
            `;
            return;
        }

        // Fallback: display as text
        el.innerHTML = `<div class="inv-result-card"><pre class="inv-pre">${this.esc(JSON.stringify(data, null, 2))}</pre></div>`;
    }

    /**
     * Parse the GAS text answer into structured items.
     * Format: "⚠️ • Name: Quantity: N Unit [LOW STOCK - Min: X] • Location: Loc • Notes: Note"
     * or:     "• Name: Quantity: N Unit • Location: Loc"
     */
    parseAnswerToItems(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const items = [];
        let header = '';

        for (const line of lines) {
            // Match item lines that start with bullet (with or without ⚠️)
            const isWarning = line.startsWith('⚠️');
            const bulletMatch = line.match(/^(?:⚠️\s*)?[•●]\s*(.+)/);
            if (!bulletMatch) {
                // Non-item line — treat as header/summary
                if (items.length === 0) header += (header ? '\n' : '') + line;
                continue;
            }

            const raw = bulletMatch[1];
            const nameMatch = raw.match(/^([^:]+?):\s*Quantity:\s*/);
            const name = nameMatch ? nameMatch[1].trim() : raw.split(':')[0].trim();
            const qtyMatch = raw.match(/Quantity:\s*([\d.]+)\s*([^•\[]*)/);
            const qty = qtyMatch ? qtyMatch[1].trim() : '';
            const unit = qtyMatch ? qtyMatch[2].trim() : '';
            const lowStock = /\[LOW STOCK/i.test(raw);
            const minMatch = raw.match(/Min:\s*(\d+)/);
            const minStock = minMatch ? minMatch[1] : '';
            const locMatch = raw.match(/Location:\s*([^•\n]+)/);
            const location = locMatch ? locMatch[1].trim() : '';
            const notesMatch = raw.match(/Notes:\s*([^•\n]+)/);
            const notes = notesMatch ? notesMatch[1].trim() : '';

            items.push({ name, qty, unit, location, notes, lowStock, minStock, isWarning });
        }

        return { items, header };
    }

    /**
     * Render parsed items as visual cards
     */
    renderItemCards(el, items, header, query) {
        let html = '';
        if (header) {
            html += `<div class="inv-cards-header">${this.esc(header)}</div>`;
        }

        html += '<div class="inv-cards-grid">';
        items.forEach(item => {
            const statusClass = item.lowStock
                ? (parseInt(item.qty) === 0 ? 'inv-card-critical' : 'inv-card-warn')
                : 'inv-card-ok';
            const statusLabel = item.lowStock
                ? (parseInt(item.qty) === 0 ? 'OUT OF STOCK' : 'LOW STOCK')
                : 'In Stock';
            const statusIcon = item.lowStock
                ? (parseInt(item.qty) === 0 ? '🔴' : '🟡')
                : '🟢';

            html += `
                <div class="inv-card ${statusClass}">
                    <div class="inv-card-qty">
                        <span class="inv-card-qty-num">${this.esc(item.qty || '0')}</span>
                        <span class="inv-card-qty-unit">${this.esc(item.unit)}</span>
                    </div>
                    <div class="inv-card-info">
                        <div class="inv-card-name">${this.esc(item.name)}</div>
                        ${item.location ? `<div class="inv-card-meta"><span class="inv-card-loc">📍 ${this.esc(item.location)}</span></div>` : ''}
                        ${item.notes ? `<div class="inv-card-notes">${this.esc(item.notes)}</div>` : ''}
                    </div>
                    <div class="inv-card-top">
                        <span class="inv-card-status">${statusIcon} ${statusLabel}</span>
                        ${item.minStock ? `<span class="inv-card-min">Min: ${this.esc(item.minStock)}</span>` : ''}
                    </div>
                </div>`;
        });
        html += '</div>';
        el.innerHTML = html;
    }

    renderUpdateResults(el, data, query) {
        const answer = data?.answer || data;

        // Try to parse items from the response
        const parsed = typeof answer === 'string' ? this.parseAnswerToItems(answer) : { items: [], header: '' };

        if (parsed.items.length === 0) {
            el.innerHTML = `
                <div class="inv-result-card">
                    <div class="inv-result-query">Found for: <strong>${this.esc(query)}</strong></div>
                    <div class="inv-result-body">${this.formatAnswer(typeof answer === 'string' ? answer : JSON.stringify(answer, null, 2))}</div>
                </div>`;
            return;
        }

        let html = '';
        if (parsed.header) {
            html += `<div class="inv-result-query">${this.esc(parsed.header)}</div>`;
        }
        html += '<div class="inv-update-list">';
        parsed.items.forEach((item, i) => {
            const statusIcon = item.lowStock ? (parseInt(item.qty) === 0 ? '🔴' : '🟡') : '🟢';
            html += `
                <div class="inv-update-item" data-index="${i}">
                    <div class="inv-update-item-info">
                        <span class="inv-update-item-name">${statusIcon} ${this.esc(item.name)}</span>
                        <span class="inv-update-item-detail">${this.esc(item.qty)} ${this.esc(item.unit)} &middot; ${this.esc(item.location)}</span>
                    </div>
                    <button class="inv-btn inv-btn-sm inv-btn-primary" data-action="update-item" data-item='${this.esc(JSON.stringify(item))}'>Update</button>
                </div>`;
        });
        html += '</div>';
        el.innerHTML = html;

        // Bind update buttons
        el.querySelectorAll('[data-action="update-item"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = JSON.parse(btn.dataset.item);
                this.showUpdateModal(item);
            });
        });
    }

    showUpdateModal(item) {
        // Remove existing modal
        this.container.querySelector('.inv-modal-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.className = 'inv-modal-overlay';
        overlay.innerHTML = `
            <div class="inv-modal">
                <div class="inv-modal-header">
                    <h3>Update: ${this.esc(item.name)}</h3>
                    <button class="inv-modal-close">&times;</button>
                </div>
                <div class="inv-modal-body">
                    <div class="inv-modal-current">
                        Current: <strong>${this.esc(item.qty)} ${this.esc(item.unit)}</strong> &middot; ${this.esc(item.location)}
                    </div>

                    <label class="inv-modal-label">Action</label>
                    <div class="inv-modal-actions">
                        <button class="inv-btn inv-btn-action active" data-action-type="add">+ Add Stock</button>
                        <button class="inv-btn inv-btn-action" data-action-type="subtract">- Remove Stock</button>
                    </div>

                    <label class="inv-modal-label" for="invModalQty">Quantity</label>
                    <input type="number" id="invModalQty" class="inv-input" min="1" value="1" placeholder="Enter quantity">

                    <label class="inv-modal-label" for="invModalNotes">Notes <span class="inv-required">*required</span></label>
                    <textarea id="invModalNotes" class="inv-input inv-textarea" rows="3"
                        placeholder="e.g. Over ordered from Smith, sold to Smith, product died, broken..."></textarea>
                    <div class="inv-modal-note-error hidden" id="invModalNoteError">A note is required before updating.</div>
                </div>
                <div class="inv-modal-footer">
                    <button class="inv-btn" id="invModalCancel">Cancel</button>
                    <button class="inv-btn inv-btn-primary" id="invModalConfirm">Confirm Update</button>
                </div>
            </div>
        `;

        this.container.appendChild(overlay);

        // State
        let actionType = 'add';

        // Close
        const close = () => overlay.remove();
        overlay.querySelector('.inv-modal-close').addEventListener('click', close);
        overlay.querySelector('#invModalCancel').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

        // Action toggle
        overlay.querySelectorAll('[data-action-type]').forEach(btn => {
            btn.addEventListener('click', () => {
                overlay.querySelectorAll('[data-action-type]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                actionType = btn.dataset.actionType;
            });
        });

        // Confirm
        overlay.querySelector('#invModalConfirm').addEventListener('click', async () => {
            const qty = parseInt(overlay.querySelector('#invModalQty').value) || 0;
            const notes = overlay.querySelector('#invModalNotes').value.trim();
            const errorEl = overlay.querySelector('#invModalNoteError');

            if (!notes) {
                errorEl.classList.remove('hidden');
                overlay.querySelector('#invModalNotes').focus();
                return;
            }
            errorEl.classList.add('hidden');

            if (qty <= 0) {
                window.app?.ui?.showNotification('Please enter a quantity greater than 0', 'error');
                return;
            }

            const confirmBtn = overlay.querySelector('#invModalConfirm');
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Updating...';

            await this.doUpdate({
                action: actionType,
                itemName: item.name,
                quantity: qty,
                unit: item.unit || '',
                location: item.location || '',
                notes: notes,
                reason: notes
            });

            close();
        });

        // Focus notes field
        overlay.querySelector('#invModalNotes').focus();
    }

    renderItemsList(el, items) {
        if (!items.length) {
            el.innerHTML = '<div class="inv-empty">No items found.</div>';
            return;
        }
        let html = '<div class="inv-items-list">';
        items.forEach(item => {
            const name = item.name || item.Name || '';
            const qty = item.quantity || item.Quantity || '';
            const unit = item.unit || item.Unit || '';
            const loc = item.location || item.Location || '';
            html += `
                <div class="inv-item-row">
                    <span class="inv-item-name">${this.esc(name)}</span>
                    <span class="inv-item-qty">${this.esc(qty)} ${this.esc(unit)}</span>
                    <span class="inv-item-loc">${this.esc(loc)}</span>
                </div>
            `;
        });
        html += '</div>';
        el.innerHTML = html;
    }

    renderBrowseTable(el) {
        const filtered = this.filterQuery
            ? this.items.filter(i => {
                const text = Object.values(i).join(' ').toLowerCase();
                return text.includes(this.filterQuery.toLowerCase());
            })
            : this.items;

        if (!filtered.length) {
            el.innerHTML = '<div class="inv-empty">No items match your filter.</div>';
            return;
        }

        const cols = [
            { key: 'name', label: 'Name' },
            { key: 'quantity', label: 'Qty' },
            { key: 'unit', label: 'Unit' },
            { key: 'location', label: 'Location' },
            { key: 'notes', label: 'Notes' },
            { key: 'minStock', label: 'Min Stock' }
        ];

        let html = '<table class="inv-table"><thead><tr>';
        cols.forEach(col => {
            const arrow = this.sortColumn === col.key
                ? (this.sortAsc ? ' &#9650;' : ' &#9660;')
                : '';
            html += `<th data-col="${col.key}">${this.esc(col.label)}${arrow}</th>`;
        });
        html += '</tr></thead><tbody>';

        // Sort
        const sorted = [...filtered];
        if (this.sortColumn) {
            const numeric = ['quantity', 'minStock'];
            const isNum = numeric.includes(this.sortColumn);
            sorted.sort((a, b) => {
                let va = a[this.sortColumn] ?? '';
                let vb = b[this.sortColumn] ?? '';
                if (isNum) {
                    va = Number(va) || 0;
                    vb = Number(vb) || 0;
                    return this.sortAsc ? va - vb : vb - va;
                }
                va = String(va).toLowerCase();
                vb = String(vb).toLowerCase();
                const cmp = va.localeCompare(vb);
                return this.sortAsc ? cmp : -cmp;
            });
        }

        sorted.forEach(item => {
            let rowClass = '';
            let badge = '';
            if (item.isCritical) { rowClass = 'inv-row-critical'; badge = ' <span class="inv-badge-critical">LOW</span>'; }
            else if (item.isLowStock) { rowClass = 'inv-row-warn'; badge = ' <span class="inv-badge-warn">LOW</span>'; }

            html += `<tr class="${rowClass}">`;
            html += `<td>${this.esc(item.name || '')}${badge}</td>`;
            html += `<td>${this.esc(item.quantity ?? '')}</td>`;
            html += `<td>${this.esc(item.unit || '')}</td>`;
            html += `<td>${this.esc(item.location || '')}</td>`;
            html += `<td>${this.esc(item.notes || '')}</td>`;
            html += `<td>${this.esc(item.minStock ?? '')}</td>`;
            html += '</tr>';
        });

        html += '</tbody></table>';
        el.innerHTML = html;

        // Bind sort click
        el.querySelectorAll('th[data-col]').forEach(th => {
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => {
                const col = th.dataset.col;
                if (this.sortColumn === col) {
                    this.sortAsc = !this.sortAsc;
                } else {
                    this.sortColumn = col;
                    this.sortAsc = true;
                }
                this.renderBrowseTable(el);
            });
        });
    }

    applyBrowseFilter(query) {
        this.filterQuery = query;
        const tableEl = this.container?.querySelector('#invBrowseTable');
        if (tableEl && this.items.length > 0) {
            this.renderBrowseTable(tableEl);
        }
    }

    // ── Helpers ──────────────────────────────────────────

    esc(text) {
        const div = document.createElement('div');
        div.textContent = String(text ?? '');
        return div.innerHTML;
    }

    formatAnswer(text) {
        // Escape HTML first, then apply markdown formatting
        const escaped = this.esc(String(text));
        return escaped
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }
}

window.InventoryView = InventoryView;
