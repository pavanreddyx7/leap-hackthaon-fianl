document.addEventListener('DOMContentLoaded', () => {
    const HOME_ID = 'H001';

    const elements = {
        homeIcon: document.getElementById('home-icon'),
        homeStatus: document.getElementById('home-status'),
        homeVoltage: document.getElementById('home-voltage'),
        homeCurrent: document.getElementById('home-current'),
        homeUpdate: document.getElementById('home-update'),

        poleIcon: document.getElementById('pole-icon'),
        poleStatus: document.getElementById('pole-status'),
        poleVoltage: document.getElementById('pole-voltage'),
        poleCurrent: document.getElementById('pole-current'),
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

        viewHistoryBtn: document.getElementById('view-history-btn'),
        downloadReportBtn: document.getElementById('download-report-btn'),
        historyCard: document.querySelector('.history-card'),
    };

    let latestData = null;

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
        const current = isPole ? elements.poleCurrent : elements.homeCurrent;

        if (!data) {
            icon.textContent = '⚪';
            status.textContent = 'AWAITING DEVICE...';
            status.style.color = 'var(--text-muted)';
            voltage.textContent = '--';
            current.textContent = '--';
            if (isPole) {
                elements.poleIdLabel.textContent = '--';
            } else {
                elements.homeUpdate.textContent = '--';
            }
            return;
        }

        const isNotReporting = data.reporting === false;
        const isOn = data.status === 'ON';

        icon.textContent = isNotReporting ? '⚪' : (isOn ? '🟢' : '🔴');

        if (isPole) {
            status.textContent = isNotReporting ? 'POLE NOT REPORTING' : (isOn ? 'POLE POWER ON' : 'POLE POWER OFF');
            status.style.color = isNotReporting ? 'var(--text-muted)' : (isOn ? 'var(--success)' : 'var(--danger)');
            elements.poleIdLabel.textContent = data.device_id;
        } else {
            status.textContent = isNotReporting ? 'NOT REPORTING' : (isOn ? 'POWER ON' : 'POWER OFF');
            status.style.color = isNotReporting ? 'var(--text-muted)' : (isOn ? 'var(--success)' : 'var(--danger)');
            elements.homeUpdate.textContent = formatTimeSince(data.timestamp);
        }

        voltage.textContent = data.voltage != null ? `${data.voltage.toFixed(2)} V` : '0.00 V';
        current.textContent = data.current_amps != null ? `${data.current_amps.toFixed(3)} A` : '0.000 A';
    }

    function statusBadge(entry) {
        if (entry.reporting === false) return { text: '⚪ NOT REPORTING', color: 'var(--text-muted)' };
        if (entry.status === 'ON') return { text: '🟢 ON', color: 'var(--success)' };
        return { text: '🔴 OFF', color: 'var(--danger)' };
    }

    function updateAlert(home, pole) {
        if (!home || !pole) return;

        const homeDown = home.status === 'OFF' || home.reporting === false;
        const poleDown = pole.status === 'OFF' || pole.reporting === false;

        const isLocalOutage = pole.status === 'ON' && pole.reporting !== false && homeDown;
        const isUpstreamOutage = poleDown && homeDown;
        const isNotReporting = home.reporting === false || pole.reporting === false;

        if (isLocalOutage || isUpstreamOutage) {
            elements.alertSection.style.display = 'block';
            elements.alertPole.textContent = pole.device_id;
            elements.alertHome.textContent = home.device_id;

            if (isNotReporting) {
                elements.alertTitle.textContent = 'DEVICE NOT REPORTING';
            } else {
                elements.alertTitle.textContent = isLocalOutage ? 'LOCAL POWER ISSUE' : 'UPSTREAM POWER ISSUE';
            }

            const poleBadge = statusBadge(pole);
            elements.alertPoleIcon.textContent = poleBadge.text;
            elements.alertPoleIcon.style.color = poleBadge.color;

            const homeBadge = statusBadge(home);
            elements.alertHomeIcon.textContent = homeBadge.text;
            elements.alertHomeIcon.style.color = homeBadge.color;

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

    if (elements.viewHistoryBtn) {
        elements.viewHistoryBtn.addEventListener('click', () => {
            if (elements.historyCard) {
                elements.historyCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    function buildPowerReport(data) {
        const lines = [];
        lines.push('POWER PROOF - Power Report');
        lines.push(`Home: ${HOME_ID}`);
        lines.push(`Generated: ${new Date().toLocaleString()}`);
        lines.push('');

        lines.push('CURRENT STATUS');
        lines.push('--------------');
        if (data.home) {
            const v = data.home.voltage != null ? data.home.voltage.toFixed(2) : '--';
            const a = data.home.current_amps != null ? data.home.current_amps.toFixed(3) : '--';
            lines.push(`Home: ${data.home.status} (${v} V, ${a} A)`);
        }
        if (data.pole) {
            const v = data.pole.voltage != null ? data.pole.voltage.toFixed(2) : '--';
            const a = data.pole.current_amps != null ? data.pole.current_amps.toFixed(3) : '--';
            lines.push(`Pole (${data.pole.device_id}): ${data.pole.status} (${v} V, ${a} A)`);
        }
        lines.push('');

        lines.push('POWER AVAILABILITY');
        lines.push('-------------------');
        if (data.analytics) {
            lines.push(`Today: ${data.analytics.today.on} ON (${data.analytics.today.pct})`);
            lines.push(`7 Days: ${data.analytics.week.on} ON (${data.analytics.week.pct})`);
            lines.push(`30 Days: ${data.analytics.month.on} ON (${data.analytics.month.pct})`);
        }
        lines.push('');

        lines.push('COMMUNITY COMPARISON');
        lines.push('---------------------');
        if (data.community) {
            lines.push(`My availability: ${data.community.my_availability}`);
            lines.push(`Area average: ${data.community.area_average}`);
        }
        lines.push('');

        lines.push('OUTAGE HISTORY');
        lines.push('---------------');
        if (data.outage_history && data.outage_history.length) {
            data.outage_history.forEach(h => {
                lines.push(`${h.date}  ${h.time}  ${h.duration}  ${h.type}`);
            });
        } else {
            lines.push('No outages recorded.');
        }
        lines.push('');

        lines.push('TICKETS');
        lines.push('-------');
        if (data.tickets && data.tickets.length) {
            data.tickets.forEach(t => lines.push(`${t.id} - ${t.issue} - ${t.status}`));
        } else {
            lines.push('No tickets.');
        }

        return lines.join('\n');
    }

    if (elements.downloadReportBtn) {
        elements.downloadReportBtn.addEventListener('click', () => {
            if (!latestData) {
                alert('No data available yet.');
                return;
            }
            const report = buildPowerReport(latestData);
            const blob = new Blob([report], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `power_report_${HOME_ID}_${new Date().toISOString().slice(0, 10)}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    function fetchData() {
        fetch(`/api/customer_data/${HOME_ID}`)
            .then(res => res.json())
            .then(data => {
                latestData = data;

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

    fetchData();

    const ws = new WebSocket(`ws://${window.location.host}/ws/customer/${HOME_ID}`);
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.event === "new_data") {
            fetchData();
        }
    };

    setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) {
            fetchData();
        }
    }, 5000);
});
