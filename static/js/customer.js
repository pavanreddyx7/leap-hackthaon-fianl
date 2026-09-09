document.addEventListener('DOMContentLoaded', () => {
    // The specific home we are viewing
    const HOME_ID = 'H001';
    
    // UI Elements
    const elements = {
        homeIcon: document.getElementById('home-icon'),
        homeStatus: document.getElementById('home-status'),
        homeVoltage: document.getElementById('home-voltage'),
        homeUpdate: document.getElementById('home-update'),

        poleIcon: document.getElementById('pole-icon'),
        poleStatus: document.getElementById('pole-status'),
        poleVoltage: document.getElementById('pole-voltage'),
        poleIdLabel: document.getElementById('pole-id-label'),

        alertSection: document.getElementById('alert-section'),
        outageStartTime: document.getElementById('outage-start-time'),
        alertPole: document.getElementById('alert-pole'),
        alertPoleIcon: document.getElementById('alert-pole-icon'),
        alertHome: document.getElementById('alert-home'),
        alertHomeIcon: document.getElementById('alert-home-icon'),
        alertTitle: document.getElementById('alert-title'),

        todayOn: document.getElementById('today-on'),
        todayPct: document.getElementById('today-pct'),
        weekOn: document.getElementById('week-on'),
        weekPct: document.getElementById('week-pct'),
        monthOn: document.getElementById('month-on'),
        monthPct: document.getElementById('month-pct'),
        
        headerHome: document.getElementById('header-home-id'),
        
        ticketsContainer: document.getElementById('tickets-container'),
        outageHistoryTable: document.getElementById('outage-history-table'),
        
        commMyAvail: document.getElementById('comm-my-avail'),
        commAreaAvail: document.getElementById('comm-area-avail'),

        ticketActionBtn: document.getElementById('ticket-action-btn'),
        reportIssueBtn: document.getElementById('report-issue-btn'),
        issueDescription: document.getElementById('issue-description'),
    };

    function formatTimeSince(isoString) {
        if (!isoString) return 'just now';
        const diffMs = new Date() - new Date(isoString);
        const diffSecs = Math.floor(diffMs / 1000);
        if (diffSecs < 60) return `${diffSecs} sec ago`;
        const diffMins = Math.floor(diffSecs / 60);
        if (diffMins < 60) return `${diffMins} min ago`;
        return `${Math.floor(diffMins / 60)}h ago`;
    }

    function updateCard(type, data) {
        const isPole = type === 'pole';
        const icon = isPole ? elements.poleIcon : elements.homeIcon;
        const status = isPole ? elements.poleStatus : elements.homeStatus;
        const voltage = isPole ? elements.poleVoltage : elements.homeVoltage;

        if (!data) {
            // No real reading exists yet for this device — say so plainly
            // instead of leaving stale/placeholder text on screen.
            icon.textContent = '⚪';
            status.textContent = 'AWAITING DEVICE...';
            status.style.color = 'var(--text-muted)';
            voltage.textContent = '--';
            if (isPole) {
                elements.poleIdLabel.textContent = '--';
            } else {
                elements.homeUpdate.textContent = '--';
            }
            return;
        }

        const isOn = data.status === 'ON';

        icon.textContent = isOn ? '🟢' : '🔴';

        if (isPole) {
            status.textContent = isOn ? 'POLE POWER ON' : 'POLE POWER OFF';
            status.style.color = isOn ? 'var(--success)' : 'var(--danger)';
            elements.poleIdLabel.textContent = data.device_id;
        } else {
            status.textContent = isOn ? 'POWER ON' : 'POWER OFF';
            status.style.color = isOn ? 'var(--success)' : 'var(--danger)';
            elements.homeUpdate.textContent = formatTimeSince(data.timestamp);
        }
        
        voltage.textContent = data.voltage != null ? `${data.voltage.toFixed(2)} V` : '0.00 V';
    }

    function updateAlert(home, pole) {
        if (!home || !pole) return;

        const isLocalOutage = pole.status === 'ON' && home.status === 'OFF';
        const isUpstreamOutage = pole.status === 'OFF' && home.status === 'OFF';
        
        if (isLocalOutage || isUpstreamOutage) {
            elements.alertSection.style.display = 'block';
            elements.alertPole.textContent = pole.device_id;
            elements.alertHome.textContent = home.device_id;
            
            elements.alertTitle.textContent = isLocalOutage ? 'LOCAL POWER ISSUE' : 'UPSTREAM POWER ISSUE';
            
            elements.alertPoleIcon.textContent = pole.status === 'ON' ? '🟢 ON' : '🔴 OFF';
            elements.alertPoleIcon.style.color = pole.status === 'ON' ? 'var(--success)' : 'var(--danger)';
            
            elements.alertHomeIcon.textContent = home.status === 'ON' ? '🟢 ON' : '🔴 OFF';
            elements.alertHomeIcon.style.color = home.status === 'ON' ? 'var(--success)' : 'var(--danger)';
            
            const startTime = new Date(home.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            elements.outageStartTime.textContent = startTime;
        } else {
            elements.alertSection.style.display = 'none';
        }
    }

    function updateAnalytics(analytics) {
        if (!analytics) return;
        elements.todayOn.textContent = `${analytics.today.on} ON`;
        elements.todayPct.textContent = analytics.today.pct;
        elements.weekOn.textContent = `${analytics.week.on} ON`;
        elements.weekPct.textContent = analytics.week.pct;
        elements.monthOn.textContent = `${analytics.month.on} ON`;
        elements.monthPct.textContent = analytics.month.pct;
    }

    function updateTickets(tickets) {
        if (!tickets || tickets.length === 0) {
            elements.ticketsContainer.innerHTML = '<p class="text-muted">No active tickets.</p>';
            return;
        }
        let html = '';
        tickets.forEach(t => {
            let statusIcon = '🔴';
            let statusText = 'IN REPAIR';
            if (t.status === 'RESOLVED' || t.status === 'CLOSED') {
                statusIcon = '🟢';
                statusText = 'RESOLVED';
            } else if (t.status === 'NEW' || t.status === 'OPEN') {
                statusIcon = '🟡';
                statusText = 'INVESTIGATING';
            }
            
            const issue = t.issue || 'Power Outage';

            html += `
                <div class="ticket-item">
                    <span><strong>${t.id}</strong> &nbsp; ${issue}</span>
                    <span>${statusIcon} ${statusText}</span>
                </div>
            `;
        });
        elements.ticketsContainer.innerHTML = html;
    }

    function updateOutageHistory(history) {
        if (!history || history.length === 0) return;
        let html = '';
        history.forEach(h => {
            html += `
                <tr>
                    <td>${h.date}</td>
                    <td>${h.time}</td>
                    <td>${h.duration}</td>
                    <td>${h.type}</td>
                </tr>
            `;
        });
        elements.outageHistoryTable.innerHTML = html;
    }

    function updateCommunity(comm) {
        if (!comm) return;
        elements.commMyAvail.textContent = comm.my_availability;
        elements.commAreaAvail.textContent = comm.area_average;
    }

    function createTicketFromCustomer(issue) {
        fetch('/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: HOME_ID, issue: issue || 'Customer Reported: Power Outage' })
        })
            .then(res => res.json())
            .then(() => {
                alert('Ticket submitted. The office team will be notified.');
                fetchData();
            })
            .catch(err => console.error(err));
    }

    if (elements.ticketActionBtn) {
        elements.ticketActionBtn.addEventListener('click', () => createTicketFromCustomer('Customer Reported: Power Outage'));
    }

    if (elements.reportIssueBtn) {
        elements.reportIssueBtn.addEventListener('click', () => {
            const issue = elements.issueDescription.value.trim();
            if (!issue) {
                alert('Please describe the issue before submitting.');
                return;
            }
            createTicketFromCustomer(issue);
            elements.issueDescription.value = '';
        });
    }

    function fetchData() {
        fetch(`/api/customer_data/${HOME_ID}`)
            .then(res => res.json())
            .then(data => {
                if (data.home) {
                    elements.headerHome.textContent = data.home.device_id;
                }

                updateCard('home', data.home);
                updateCard('pole', data.pole);
                updateAlert(data.home, data.pole);
                updateAnalytics(data.analytics);
                updateTickets(data.tickets);
                updateOutageHistory(data.outage_history);
                updateCommunity(data.community);
            })
            .catch(err => console.error(err));
    }

    // Initial fetch
    fetchData();

    // Use WebSockets for live updates
    const ws = new WebSocket(`ws://${window.location.host}/ws/customer/${HOME_ID}`);
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.event === "new_data") {
            fetchData();
        }
    };
    
    // Fallback polling just in case WS drops
    setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) {
            fetchData();
        }
    }, 5000);
});
