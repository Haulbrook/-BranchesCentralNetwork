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

        resultsEl.innerHTML = '<div class="inv-loading"><div class="inv-spinner"></div> Searching...</div>';

        try {
            const api = window.app?.api;
            if (!api) throw new Error('API not available');

            const result = await api.searchInventory(query);
            const data = result?.response || result;

            if (target === 'update') {
                this.renderUpdateResults(resultsEl, data, query);
            } else {
                this.renderSearchResults(resultsEl, data, query);
            }
        } catch (err) {
            console.error('Inventory search failed:', err);
            resultsEl.innerHTML = `<div class="inv-error">Search failed: ${this.esc(err.message)}</div>`;
        }
    }

    async loadBrowse() {
        const tableEl = this.container.querySelector('#invBrowseTable');
        const countEl = this.container.querySelector('#invBrowseCount');
        if (!tableEl) return;

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
            console.error('Browse inventory failed:', err);
            tableEl.innerHTML = `<div class="inv-error">Failed to load inventory: ${this.esc(err.message)}</div>`;
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
            console.error('Update failed:', err);
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
        if (typeof answer === 'string') {
            el.innerHTML = `
                <div class="inv-result-card">
                    <div class="inv-result-query">Results for: <strong>${this.esc(query)}</strong></div>
                    <div class="inv-result-body">${this.formatAnswer(answer)}</div>
                </div>
            `;
            return;
        }

        // If it returned structured items
        if (Array.isArray(answer)) {
            this.renderItemsList(el, answer);
            return;
        }

        // Fallback: display as text
        el.innerHTML = `<div class="inv-result-card"><pre class="inv-pre">${this.esc(JSON.stringify(data, null, 2))}</pre></div>`;
    }

    renderUpdateResults(el, data, query) {
        const answer = data?.answer || data;

        // Try to parse structured data from the answer
        el.innerHTML = `
            <div class="inv-result-card">
                <div class="inv-result-query">Found for: <strong>${this.esc(query)}</strong></div>
                <div class="inv-result-body">${this.formatAnswer(typeof answer === 'string' ? answer : JSON.stringify(answer, null, 2))}</div>
                <p class="inv-hint" style="margin-top:12px;">To update quantities, use the chat interface or update directly in the Google Sheet.</p>
            </div>
        `;
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
        // Convert markdown-ish formatting to HTML
        return String(text)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }
}

window.InventoryView = InventoryView;
