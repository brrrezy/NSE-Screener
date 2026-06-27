document.addEventListener('DOMContentLoaded', () => {
    const scanForm = document.getElementById('scan-form');
    const runBtn = document.getElementById('run-btn');
    const downloadBtn = document.getElementById('download-btn');
    const loader = document.getElementById('loader');
    const loadingMsg = document.getElementById('loading-msg');
    const resultsBody = document.getElementById('results-body');
    const statusBadge = document.getElementById('status-badge');
    const pulseDot = document.getElementById('pulse-dot');
    const tableSearch = document.getElementById('table-search');

    // Range input value displays
    const minScoreInput = document.getElementById('min_score');
    const minScoreVal = document.getElementById('min_score_val');
    const topNInput = document.getElementById('top_n');
    const topNVal = document.getElementById('top_n_val');

    minScoreInput.addEventListener('input', (e) => minScoreVal.textContent = e.target.value);
    topNInput.addEventListener('input', (e) => topNVal.textContent = e.target.value);

    topNInput.addEventListener('input', (e) => topNVal.textContent = e.target.value);

    // Ticker Autocomplete Logic
    const symbolInput = document.getElementById('symbol');
    const suggestionsDiv = document.getElementById('ticker-suggestions');

    symbolInput.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) {
            suggestionsDiv.classList.remove('active');
            return;
        }

        try {
            const resp = await fetch(`/api/tickers?q=${query}`);
            const { results } = await resp.json();
            
            if (results.length > 0) {
                suggestionsDiv.innerHTML = results.map((s, idx) => `
                    <div class="suggestion-item" data-index="${idx}" data-symbol="${s.symbol}">
                        <div style="font-weight: 600; color: var(--text-primary); font-size: 0.85rem;">${s.symbol}</div>
                        <div style="font-size: 0.7rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">${s.name}</div>
                    </div>
                `).join('');
                suggestionsDiv.classList.add('active');
                
                // Add click events
                suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
                    item.addEventListener('click', () => {
                        selectSuggestion(item.getAttribute('data-symbol'));
                    });
                });
            } else {
                suggestionsDiv.classList.remove('active');
            }
        } catch (err) {
            console.error('Ticker search failed', err);
        }
    });

    // Keyboard Navigation
    let activeIndex = -1;
    symbolInput.addEventListener('keydown', (e) => {
        const items = suggestionsDiv.querySelectorAll('.suggestion-item');
        if (!suggestionsDiv.classList.contains('active') || items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = (activeIndex + 1) % items.length;
            updateActiveSuggestion(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = (activeIndex - 1 + items.length) % items.length;
            updateActiveSuggestion(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex > -1) {
                selectSuggestion(items[activeIndex].getAttribute('data-symbol'));
            } else {
                // If no suggestion selected, just submit the form
                scanForm.dispatchEvent(new Event('submit'));
            }
        } else if (e.key === 'Escape') {
            suggestionsDiv.classList.remove('active');
        }
    });

    function updateActiveSuggestion(items) {
        items.forEach((item, idx) => {
            item.classList.toggle('highlight', idx === activeIndex);
            if (idx === activeIndex) item.scrollIntoView({ block: 'nearest' });
        });
    }

    function selectSuggestion(value) {
        symbolInput.value = value;
        suggestionsDiv.classList.remove('active');
        activeIndex = -1;
        // Trigger scan immediately
        scanForm.dispatchEvent(new Event('submit'));
    }

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!symbolInput.contains(e.target) && !suggestionsDiv.contains(e.target)) {
            suggestionsDiv.classList.remove('active');
        }
    });

    // Helper: Format large numbers
    const formatNum = (num) => {
        if (num === null || num === undefined || isNaN(num)) return '-';
        return num.toLocaleString();
    };

    // Helper: Format percentages
    const formatPct = (num) => {
        if (num === null || num === undefined || isNaN(num)) return '-';
        return num.toFixed(2) + '%';
    };

    // Helper: Update stats with animation
    const updateStat = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    // Table Search Filter
    tableSearch.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const rows = resultsBody.querySelectorAll('tr');
        rows.forEach(row => {
            if (row.classList.contains('empty-state')) return;
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    });

    scanForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Reset UI
        resultsBody.innerHTML = `
            <tr class="empty-state">
                <td colspan="10">
                    <div class="empty-msg">
                        <i class="fas fa-circle-notch fa-spin"></i>
                        <p>Processing data stream...</p>
                    </div>
                </td>
            </tr>`;
        
        loader.classList.add('active');
        runBtn.disabled = true;
        downloadBtn.disabled = true;
        statusBadge.textContent = 'Processing...';
        pulseDot.className = 'pulse warning';

        const formData = new FormData(scanForm);
        const params = new URLSearchParams(formData);

        try {
            const response = await fetch(`/api/scan?${params.toString()}`, { method: 'GET' });
            
            if (!response.ok) throw new Error('Scan failed');

            const result = await response.json();
            const data = result.data || [];
            const summary = result.summary || {};

            // Update Summary Cards
            updateStat('stat-universe', formatNum(summary.total_universe));
            updateStat('stat-scanned', formatNum(summary.scanned));
            updateStat('stat-passed', formatNum(summary.passed_filter));
            updateStat('stat-errors', formatNum(summary.errors));

            if (data.length === 0) {
                resultsBody.innerHTML = '<tr><td colspan="10" class="empty-msg">No candidates found matching the criteria.</td></tr>';
            } else {
                resultsBody.innerHTML = '';
                data.forEach(item => {
                    const row = document.createElement('tr');
                    
                    // Setup flow tags
                    const vcpTag = `<span class="setup-tag ${item.VCP ? 'active' : 'inactive'}">VCP</span>`;
                    const sfpTag = `<span class="setup-tag ${item.SFP ? 'active' : 'inactive'}">SFP</span>`;
                    const ipoTag = `<span class="setup-tag ${item.IPO_BASE ? 'active' : 'inactive'}">IPO</span>`;
                    const mrvTag = `<span class="setup-tag ${item.Minervini ? 'active' : 'inactive'}">MINERVINI</span>`;

                    row.innerHTML = `
                        <td class="ticker-cell">${item.Symbol}</td>
                        <td><div class="score-badge">${item.Score}</div></td>
                        <td><span class="val-badge">${item.RSRating !== undefined ? item.RSRating : '-'}</span></td>
                        <td><span class="val-badge">${item.ConfluenceScore !== undefined ? item.ConfluenceScore : '-'}/8</span></td>
                        <td><span class="val-badge">${item.SetupScore !== undefined ? item.SetupScore : '-'}/5</span></td>
                        <td>₹${formatNum(item.Price)}</td>
                        <td style="color: ${item.RSI > 60 ? '#10b981' : '#a1a1aa'}">${item.RSI ? item.RSI.toFixed(1) : '-'}</td>
                        <td style="color: ${item.VolMult > 2 ? '#10b981' : '#ededed'}">${item.VolMult ? item.VolMult.toFixed(2) : '-'}x</td>
                        <td>${formatPct(item['ADR%'])}</td>
                        <td>
                            <div class="setup-pill">
                                ${mrvTag} ${vcpTag} ${sfpTag} ${ipoTag}
                            </div>
                        </td>
                    `;
                    row.addEventListener('click', () => {
                        resultsBody.querySelectorAll('tr').forEach(r => r.classList.remove('active-row'));
                        row.classList.add('active-row');
                        showDetailsDrawer(item);
                    });
                    resultsBody.appendChild(row);
                });
                downloadBtn.disabled = false;
            }

            statusBadge.textContent = 'System Ready';
            pulseDot.className = 'pulse active';

        } catch (error) {
            console.error(error);
            statusBadge.textContent = 'System Error';
            pulseDot.className = 'pulse error';
            resultsBody.innerHTML = `<tr><td colspan="10" class="empty-msg">Error executing scan. Check backend logs.</td></tr>`;
        } finally {
            loader.classList.remove('active');
            runBtn.disabled = false;
        }
    });

    downloadBtn.addEventListener('click', async () => {
        try {
            window.location.href = '/api/download';
        } catch (error) {
            alert('Download failed');
        }
    });

    // Drawer Elements & Functions
    const detailsDrawer = document.getElementById('details-drawer');
    const closeDrawerBtn = document.getElementById('close-drawer-btn');
    
    closeDrawerBtn.addEventListener('click', () => {
        detailsDrawer.classList.remove('active');
        resultsBody.querySelectorAll('tr').forEach(r => r.classList.remove('active-row'));
    });

    // Close drawer on clicking outside the drawer
    document.addEventListener('mousedown', (e) => {
        if (detailsDrawer.classList.contains('active') && 
            !detailsDrawer.contains(e.target) && 
            !resultsBody.contains(e.target)) {
            detailsDrawer.classList.remove('active');
            resultsBody.querySelectorAll('tr').forEach(r => r.classList.remove('active-row'));
        }
    });

    // Close on ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && detailsDrawer.classList.contains('active')) {
            detailsDrawer.classList.remove('active');
            resultsBody.querySelectorAll('tr').forEach(r => r.classList.remove('active-row'));
        }
    });

    function showDetailsDrawer(stock) {
        document.getElementById('drawer-ticker').textContent = stock.Symbol;
        document.getElementById('drawer-name').textContent = stock.Name || 'NSE Equity Ticker';
        document.getElementById('drawer-price').textContent = `₹${formatNum(stock.Price)}`;
        document.getElementById('drawer-score').textContent = `${stock.Score}/13`;
        
        // Render Pre-Circuit Score details
        const preCircuitScore = stock.PreCircuitScore !== undefined ? stock.PreCircuitScore : 0;
        document.getElementById('drawer-circuit-score').textContent = `${preCircuitScore}/10`;
        
        const progressEl = document.getElementById('drawer-circuit-progress');
        progressEl.style.width = `${preCircuitScore * 10}%`;
        
        const bannerEl = document.getElementById('drawer-circuit-banner');
        if (preCircuitScore >= 7) {
            progressEl.style.background = 'linear-gradient(90deg, #a855f7, #ec4899)';
            bannerEl.style.display = 'flex';
        } else if (preCircuitScore >= 4) {
            progressEl.style.background = 'var(--accent-blue)';
            bannerEl.style.display = 'none';
        } else {
            progressEl.style.background = 'var(--text-muted)';
            bannerEl.style.display = 'none';
        }
        
        // Setup badges
        const setupsFlex = document.getElementById('drawer-setups');
        setupsFlex.innerHTML = `
            <span class="setup-tag ${stock.Minervini ? 'active' : 'inactive'}">Minervini Trend</span>
            <span class="setup-tag ${stock.VCP ? 'active' : 'inactive'}">VCP Setup</span>
            <span class="setup-tag ${stock.SFP ? 'active' : 'inactive'}">SFP (Swing Failure)</span>
            <span class="setup-tag ${stock.IPO_BASE ? 'active' : 'inactive'}">IPO Base</span>
        `;
        
        // Confluence checklist (8 factors)
        const confList = document.getElementById('drawer-confluence-list');
        const signals = [
            { key: 'TREND', label: 'Trend alignment (Close > EMA50 > EMA200)' },
            { key: 'MACD', label: 'MACD bullish crossover (MACD > Signal)' },
            { key: 'RSI', label: 'RSI momentum (RSI >= 55)' },
            { key: 'STOCH', label: 'Stochastic oscillator (Stoch >= 60)' },
            { key: 'VOLUME', label: 'Volume spike (Volume >= 1.2x 20MA)' },
            { key: 'DELTA', label: 'Positive accumulation (Delta Proxy > 0)' },
            { key: 'ADX', label: 'ADX Trend strength (ADX >= 20)' },
            { key: 'ATR', label: 'ATR volatility proxy (ATR > 0)' }
        ];
        
        confList.innerHTML = signals.map(sig => {
            const passed = stock[`C_${sig.key}`];
            const icon = passed ? '<i class="fas fa-check-circle checklist-icon pass"></i>' : '<i class="fas fa-times-circle checklist-icon fail"></i>';
            const statusText = passed ? 'Passed' : 'Failed';
            return `
                <li class="checklist-item">
                    <span class="checklist-item-left">
                        ${icon}
                        <span>${sig.label}</span>
                    </span>
                    <span style="color: ${passed ? 'var(--accent-green)' : 'var(--text-muted)'}; font-weight: 500;">${statusText}</span>
                </li>
            `;
        }).join('');
        
        // Fundamentals grid
        const fundGrid = document.getElementById('drawer-fundamentals');
        
        const formatRatio = (val, isPct=false) => {
            if (val === null || val === undefined || isNaN(val)) return '-';
            return isPct ? `${(val * 100).toFixed(1)}%` : val.toFixed(2);
        };
        
        fundGrid.innerHTML = `
            <div class="fundamental-card">
                <span class="fund-label">Trailing P/E</span>
                <span class="fund-value">${stock.PE ? stock.PE.toFixed(1) : '-'}</span>
            </div>
            <div class="fundamental-card">
                <span class="fund-label">Return on Equity</span>
                <span class="fund-value">${formatRatio(stock.ROE, true)}</span>
            </div>
            <div class="fundamental-card">
                <span class="fund-label">Debt to Equity</span>
                <span class="fund-value">${stock.DebtToEquity ? stock.DebtToEquity.toFixed(2) : '-'}</span>
            </div>
            <div class="fundamental-card">
                <span class="fund-label">Operating Margin</span>
                <span class="fund-value">${formatRatio(stock.OperatingMargin, true)}</span>
            </div>
            <div class="fundamental-card">
                <span class="fund-label">Revenue Growth</span>
                <span class="fund-value">${formatRatio(stock.RevenueGrowth, true)}</span>
            </div>
            <div class="fundamental-card">
                <span class="fund-label">Quality Score</span>
                <span class="fund-value" style="color: var(--accent-blue);">${stock.FundamentalQualityScore !== undefined ? stock.FundamentalQualityScore : '0'}/4</span>
            </div>
        `;
        
        detailsDrawer.classList.add('active');
    }
});
