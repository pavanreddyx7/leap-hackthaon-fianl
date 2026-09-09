document.addEventListener('DOMContentLoaded', () => {
    let globalData = null;
    let selectedPoleId = null;

    // UI Elements
    const elements = {
        statPoles: document.getElementById('stat-total-poles'),
        statCurrent: document.getElementById('stat-current-poles'),
        statNoCurrent: document.getElementById('stat-no-current'),
        statNotReporting: document.getElementById('stat-not-reporting'),
        statHomes: document.getElementById('stat-total-homes'),
        statTickets: document.getElementById('stat-open-tickets'),
        
        mapContainer: document.getElementById('pole-map-container'),
        alertsContainer: document.getElementById('critical-alerts-container'),
        navAlertBadge: document.getElementById('nav-alert-badge'),
        
        selPoleId: document.getElementById('sel-pole-id'),
        selPoleStatus: document.getElementById('sel-pole-status'),
        selPoleVoltage: document.getElementById('sel-pole-voltage'),
        selPoleFeeder: document.getElementById('sel-pole-feeder'),
        selPoleLoc: document.getElementById('sel-pole-loc'),
        selPoleTime: document.getElementById('sel-pole-time'),
        selPoleHomesCount: document.getElementById('sel-pole-homes-count'),
        selPoleConnectivity: document.getElementById('sel-pole-connectivity'),
        
        homesGrid: document.getElementById('homes-grid-container'),
        ticketsTable: document.getElementById('tickets-table-body'),
        
        searchInput: document.getElementById('pole-search'),
        searchResult: document.getElementById('search-result')
    };

    function renderStats(stats) {
        elements.statPoles.textContent = stats.total_poles;
        elements.statCurrent.textContent = stats.current_poles;
        elements.statNoCurrent.textContent = stats.no_current_poles;
        elements.statNotReporting.textContent = stats.not_reporting_poles;
        elements.statHomes.textContent = stats.total_homes;
        elements.statTickets.textContent = stats.open_tickets;
    }

    function renderAlerts(alerts) {
        if (elements.navAlertBadge) {
            const count = alerts ? alerts.length : 0;
            elements.navAlertBadge.textContent = count;
            elements.navAlertBadge.style.display = count > 0 ? 'inline-block' : 'none';
        }

        if (!alerts || alerts.length === 0) {
            elements.alertsContainer.innerHTML = '<p class="text-muted">No critical alerts.</p>';
            return;
        }

        let html = '';
        alerts.forEach(a => {
            const isOffline = a.status === 'NO SIGNAL';
            const icon = isOffline ? '📡' : '🔴';
            const cls = isOffline ? 'alert-item offline' : 'alert-item';
            html += `
                <div class="${cls}" onclick="window.selectPole('${a.pole_id}')">
                    <strong>${icon} ${a.pole_id} — ${a.status}</strong>
                    <span>${a.homes_affected} homes affected</span>
                </div>
            `;
        });
        elements.alertsContainer.innerHTML = html;
    }

    function renderTickets(tickets) {
        if (!tickets || tickets.length === 0) {
            elements.ticketsTable.innerHTML = '<tr><td colspan="7" class="text-muted">No open tickets.</td></tr>';
            return;
        }

        let html = '';
        tickets.forEach(t => {
            html += `
                <tr>
                    <td><strong>${t.id}</strong></td>
                    <td>${t.pole_id}</td>
                    <td>${t.homes_affected} Homes</td>
                    <td>${t.issue}</td>
                    <td>${t.priority}</td>
                    <td>${t.status}</td>
                    <td><button class="btn btn-outline" onclick="window.resolveTicket(${t.raw_id})">ISSUE SOLVED</button></td>
                </tr>
            `;
        });
        elements.ticketsTable.innerHTML = html;
    }

    function statusIcon(status) {
        if (status === 'ON') return '🟢';
        if (status === 'OFF') return '🔴';
        return '📡'; // NO DATA — pole isn't sending telemetry
    }

    function renderNode(pole, prefix, indent, alertPoleIds) {
        const icon = statusIcon(pole.status);
        const isSelected = pole.id === selectedPoleId;
        const nodeClass = isSelected ? 'pole-node selected' : 'pole-node';

        // Always-visible: how many homes this pole feeds
        const homesBadge = `<span class="pole-node-homes" title="Connected homes">🏠 ${pole.homes_count}</span>`;

        // Always-visible: live no-current / not-reporting indicator
        let statusBadge = '';
        if (pole.status === 'OFF') {
            statusBadge = ' <span class="pole-node-status danger">⚠ NO CURRENT</span>';
        } else if (pole.status === 'NO DATA') {
            statusBadge = ' <span class="pole-node-status warning">⚠ NO SIGNAL</span>';
        }

        // Always-visible: flag if this pole currently has an active critical alert
        const alertBadge = alertPoleIds.has(pole.id) ? ' <span class="pole-node-alert">🚨 ALERT</span>' : '';

        let detail = '';
        if (isSelected) {
            const timeStr = pole.last_update ? new Date(pole.last_update).toLocaleTimeString() : '--:--:--';
            detail = ` <span class="pole-node-detail">— ${pole.location || 'no location'} • updated ${timeStr}</span>`;
        }

        return `<div>${indent}${prefix}<span class="${nodeClass}" onclick="window.selectPole('${pole.id}')">${icon} ${pole.id}</span> ${homesBadge}${statusBadge}${alertBadge}${detail}</div>`;
    }

    function renderHomeNode(home, prefix, indent) {
        const isOn = home.status === 'ON';
        const cls = `home-node ${isOn ? 'on' : 'off'}`;
        const icon = isOn ? '🟢' : '🔴';
        return `<div>${indent}${prefix}<span class="${cls}" onclick="window.selectPole('${home.parent_pole_id}')" title="${isOn ? 'ON' : 'OFF'}">🏠 ${icon} ${home.id}</span></div>`;
    }

    // Recursively builds the tree: each pole's child poles AND its directly connected homes as leaves
    function buildTreeHTML(poles, homes, parentPoleId, depth, alertPoleIds) {
        const childPoles = poles.filter(p => p.parent_id === parentPoleId);
        const childHomes = homes.filter(h => h.parent_pole_id === parentPoleId);
        const combined = [
            ...childPoles.map(item => ({ type: 'pole', item })),
            ...childHomes.map(item => ({ type: 'home', item }))
        ];
        if (combined.length === 0) return '';

        let html = '';
        combined.forEach((entry, index) => {
            const isLast = index === combined.length - 1;
            const prefix = isLast ? '└─ ' : '├─ ';
            const indent = '&nbsp;'.repeat(depth * 4);

            if (entry.type === 'pole') {
                html += renderNode(entry.item, prefix, indent, alertPoleIds);
                html += buildTreeHTML(poles, homes, entry.item.id, depth + 1, alertPoleIds);
            } else {
                html += renderHomeNode(entry.item, prefix, indent);
            }
        });
        return html;
    }

    function renderMap(poles, homes, alerts) {
        const alertPoleIds = new Set((alerts || []).map(a => a.pole_id));
        const rootPoles = poles.filter(p => !p.parent_id);
        let html = '';
        rootPoles.forEach(root => {
            html += renderNode(root, '', '', alertPoleIds);
            html += buildTreeHTML(poles, homes || [], root.id, 1, alertPoleIds);
        });
        elements.mapContainer.innerHTML = html;
    }

    window.selectPole = function(poleId) {
        selectedPoleId = poleId;
        if (!globalData) return;
        
        const pole = globalData.poles.find(p => p.id === poleId);
        if (!pole) return;

        // Re-render the map so the selected node is highlighted with its live detail inline
        renderMap(globalData.poles, globalData.homes, globalData.alerts);

        // Update Pole Details
        elements.selPoleId.textContent = pole.id;

        let statusText, statusClass;
        if (pole.status === 'ON') {
            statusText = 'RECEIVING CURRENT';
            statusClass = 'success';
        } else if (pole.status === 'OFF') {
            statusText = 'NOT RECEIVING CURRENT';
            statusClass = 'danger';
        } else {
            statusText = 'NO SIGNAL';
            statusClass = 'warning';
        }
        elements.selPoleStatus.textContent = statusText;
        elements.selPoleStatus.className = `status-badge ${statusClass}`;

        elements.selPoleVoltage.textContent = `${pole.voltage} V`;
        elements.selPoleFeeder.textContent = pole.parent_id || 'MAIN GRID';
        elements.selPoleLoc.textContent = pole.location || '--';

        const timeStr = pole.last_update ? new Date(pole.last_update).toLocaleTimeString() : '--:--:--';
        elements.selPoleTime.textContent = timeStr;

        if (pole.reporting) {
            elements.selPoleConnectivity.textContent = '';
        } else if (pole.seconds_since_update === null) {
            elements.selPoleConnectivity.textContent = '⚠️ This pole has never reported telemetry.';
        } else {
            const mins = Math.floor(pole.seconds_since_update / 60);
            const secs = Math.floor(pole.seconds_since_update % 60);
            elements.selPoleConnectivity.textContent = `⚠️ No telemetry received for ${mins}m ${secs}s — pole may be offline.`;
        }

        elements.selPoleHomesCount.textContent = pole.homes_count;

        // Update Connected Homes Grid
        const connectedHomes = globalData.homes.filter(h => h.parent_pole_id === pole.id);
        if (connectedHomes.length === 0) {
            elements.homesGrid.innerHTML = '<p class="text-muted">No homes connected directly to this pole.</p>';
        } else {
            let hHtml = '';
            connectedHomes.forEach(h => {
                const hIcon = h.status === 'ON' ? '🟢 ON' : '🔴 OFF';
                hHtml += `<div class="home-item">${h.id} ${hIcon}</div>`;
            });
            elements.homesGrid.innerHTML = hHtml;
        }
    };

    function showSearchResult(text, type) {
        if (!elements.searchResult) return;
        elements.searchResult.textContent = text;
        elements.searchResult.className = `search-result ${type}`;
    }

    window.searchPole = function() {
        const query = elements.searchInput.value.trim().toUpperCase();
        if (!query || !globalData) return;

        const pole = globalData.poles.find(p => p.id === query);
        if (pole) {
            window.selectPole(pole.id);
            const label = pole.status === 'ON' ? '🟢 ON' : (pole.status === 'OFF' ? '🔴 OFF' : '📡 NO SIGNAL');
            const type = pole.status === 'ON' ? 'success' : (pole.status === 'OFF' ? 'danger' : 'warning');
            showSearchResult(`⚡ Pole ${pole.id} — ${label}`, type);
            return;
        }

        const home = globalData.homes.find(h => h.id === query);
        if (home) {
            window.selectPole(home.parent_pole_id);
            const label = home.status === 'ON' ? '🟢 ON' : '🔴 OFF';
            const type = home.status === 'ON' ? 'success' : 'danger';
            showSearchResult(`🏠 Home ${home.id} — ${label} (connected to ${home.parent_pole_id})`, type);
            return;
        }

        showSearchResult(`No pole or home found for "${query}"`, 'muted');
    };

    elements.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') window.searchPole();
    });

    window.resolveTicket = function(ticketRawId) {
        fetch(`/api/tickets/${ticketRawId}/resolve`, { method: 'POST' })
            .then(res => res.json())
            .then(() => fetchData())
            .catch(err => console.error(err));
    };

    window.addHome = function() {
        if (!selectedPoleId) {
            alert('Select a pole first.');
            return;
        }
        const homeId = prompt('New home ID (e.g. H002):');
        if (!homeId) return;
        const location = prompt('Location (optional):', '') || '';

        fetch('/api/homes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ home_id: homeId.trim().toUpperCase(), pole_id: selectedPoleId, location })
        })
            .then(res => {
                if (!res.ok) return res.json().then(e => { throw new Error(e.detail || 'Failed to add home'); });
                return res.json();
            })
            .then(() => fetchData())
            .catch(err => alert(err.message));
    };

    function fetchData() {
        fetch('/api/dashboard_data')
            .then(res => res.json())
            .then(data => {
                globalData = data;
                renderStats(data.stats);
                renderAlerts(data.alerts);
                renderTickets(data.tickets);
                renderMap(data.poles, data.homes, data.alerts);
                
                // Keep selected pole active or default to the first alert pole
                if (selectedPoleId) {
                    window.selectPole(selectedPoleId);
                } else if (data.alerts.length > 0) {
                    window.selectPole(data.alerts[0].pole_id);
                } else if (data.poles.length > 0) {
                    window.selectPole(data.poles[0].id);
                }
            })
            .catch(err => console.error(err));
    }

    // Initial load
    fetchData();

    // WebSockets
    const ws = new WebSocket(`ws://${window.location.host}/ws/dashboard`);
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.event === "new_data") {
            fetchData();
        }
    };

    // Polling fallback
    setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) {
            fetchData();
        }
    }, 5000);
});
