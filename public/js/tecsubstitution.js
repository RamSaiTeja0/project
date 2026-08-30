/**
 * TecSubstitution — primary timetable + faculty availability lookup.
 *
 * Flow: render the primary timetable -> user clicks a cell -> POST the cell's
 * day + period to /api/availability -> display the FREE faculty.
 *
 * This view is read-only. It never assigns a substitute, never saves a
 * selection and never modifies the timetable: the only request it makes with a
 * body is the availability lookup, which the backend serves without writing.
 */
(function () {
    'use strict';

    var TIMETABLE_URL = '/api/availability/timetable';
    var AVAILABILITY_URL = '/api/availability';

    // Metadata for every rendered cell, keyed by "day|period".
    var cellMetadata = {};
    var selectedKey = null;
    // Guards against out-of-order responses when cells are clicked quickly.
    var requestToken = 0;

    function el(id) { return document.getElementById(id); }

    function slotKey(day, period) { return day + '|' + period; }

    function setTimetableState(message, kind) {
        var node = el('timetableState');
        if (!node) return;
        if (!message) {
            node.style.display = 'none';
            node.textContent = '';
            return;
        }
        node.style.display = 'block';
        node.className = 'state-msg ' + (kind || 'state-loading');
        node.textContent = message;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ------------------------------------------------------------ rendering

    function renderTimetable(timetable) {
        var head = el('timetableHead');
        var body = el('timetableBody');
        if (!head || !body) return;

        var days = timetable.days || [];
        var periods = timetable.periods || [];
        var timings = timetable.periodTimings || {};

        var chip = el('classChip');
        if (chip) chip.textContent = timetable.class || '—';

        // --- header row: one column per period ---
        var headHtml = '<tr><th class="day-head">Day</th>';
        periods.forEach(function (period) {
            var timing = timings[String(period)] || {};
            var label = timing.start && timing.end
                ? '<small>' + escapeHtml(timing.start) + '–' + escapeHtml(timing.end) + '</small>'
                : '';
            headHtml += '<th>P' + escapeHtml(period) + label + '</th>';
        });
        headHtml += '</tr>';
        head.innerHTML = headHtml;

        // --- index the cells returned by the API ---
        var byKey = {};
        (timetable.cells || []).forEach(function (cell) {
            byKey[slotKey(cell.day, cell.period)] = cell;
        });

        // --- body: one row per day ---
        cellMetadata = {};
        body.innerHTML = '';

        days.forEach(function (day) {
            var row = document.createElement('tr');

            var dayCell = document.createElement('th');
            dayCell.className = 'day-head';
            dayCell.scope = 'row';
            dayCell.textContent = day;
            row.appendChild(dayCell);

            periods.forEach(function (period) {
                var key = slotKey(day, period);
                var cell = byKey[key] || {
                    day: day, period: period, class: timetable.class,
                    subject: null, faculty: null, room: null, status: 'FREE'
                };

                // Every cell carries its own metadata.
                var metadata = {
                    day: cell.day,
                    period: cell.period,
                    class: cell.class || timetable.class || null,
                    subject: cell.subject || null,
                    faculty: cell.faculty || null,
                    room: cell.room || null,
                    startTime: cell.startTime || null,
                    endTime: cell.endTime || null,
                    status: cell.status || 'FREE'
                };
                cellMetadata[key] = metadata;

                var td = document.createElement('td');
                td.className = 'slot';

                var button = document.createElement('button');
                button.type = 'button';
                button.className = 'slot-btn' + (metadata.subject ? '' : ' is-free');
                button.setAttribute('data-key', key);
                // Mirrored onto the DOM so the cell is self-describing.
                button.setAttribute('data-day', metadata.day);
                button.setAttribute('data-period', String(metadata.period));
                button.setAttribute('data-class', metadata.class || '');
                button.setAttribute('data-subject', metadata.subject || '');
                button.setAttribute('data-faculty', metadata.faculty || '');
                button.setAttribute('data-room', metadata.room || '');
                button.setAttribute('aria-label',
                    metadata.day + ' Period ' + metadata.period +
                    (metadata.subject ? ' — ' + metadata.subject + ', ' + metadata.faculty : ' — free'));

                if (metadata.subject) {
                    button.innerHTML =
                        '<div class="slot-subject">' + escapeHtml(metadata.subject) + '</div>' +
                        '<div class="slot-faculty">' + escapeHtml(metadata.faculty || '') + '</div>' +
                        (metadata.room ? '<div class="slot-room">' + escapeHtml(metadata.room) + '</div>' : '');
                } else {
                    button.innerHTML = '<div class="slot-subject">FREE</div>';
                }

                button.addEventListener('click', function () { selectCell(key); });

                td.appendChild(button);
                row.appendChild(td);
            });

            body.appendChild(row);
        });

        setTimetableState('');
    }

    function markSelected(key) {
        selectedKey = key;
        var buttons = document.querySelectorAll('.slot-btn');
        Array.prototype.forEach.call(buttons, function (button) {
            var isSelected = button.getAttribute('data-key') === key;
            button.classList.toggle('is-selected', isSelected);
            button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        });
    }

    // ------------------------------------------------------- result panel

    function renderPanel(metadata, bodyHtml) {
        var panel = el('resultPanel');
        if (!panel) return;

        panel.innerHTML =
            '<div class="selected-head">' +
                '<div class="selected-slot">' + escapeHtml(metadata.day) +
                    ' — Period ' + escapeHtml(metadata.period) + '</div>' +
                (metadata.startTime && metadata.endTime
                    ? '<div class="meta-row"><span class="meta-label">Time</span>' +
                      '<span class="meta-value">' + escapeHtml(metadata.startTime) + '–' +
                      escapeHtml(metadata.endTime) + '</span></div>'
                    : '') +
            '</div>' +
            '<div class="meta-row"><span class="meta-label">Class</span>' +
                '<span class="meta-value">' + escapeHtml(metadata.class || '—') + '</span></div>' +
            '<div class="meta-row"><span class="meta-label">Subject</span>' +
                '<span class="meta-value">' + escapeHtml(metadata.subject || 'Free period') + '</span></div>' +
            '<div class="meta-row"><span class="meta-label">Faculty</span>' +
                '<span class="meta-value">' + escapeHtml(metadata.faculty || '—') + '</span></div>' +
            (metadata.room
                ? '<div class="meta-row"><span class="meta-label">Room</span>' +
                  '<span class="meta-value">' + escapeHtml(metadata.room) + '</span></div>'
                : '') +
            '<div class="section-label">Available Faculty</div>' +
            '<div id="availabilityResult">' + bodyHtml + '</div>' +
            '<p class="readonly-note">Display only — no substitute is assigned and nothing is saved.</p>';
    }

    function availabilityLoadingHtml() {
        return '<div class="state-msg state-loading">Checking availability…</div>';
    }

    function availabilityListHtml(names) {
        return '<ul class="faculty-list">' + names.map(function (name) {
            return '<li><span class="dot"></span>' + escapeHtml(name) + '</li>';
        }).join('') + '</ul>';
    }

    function availabilityMessageHtml(message, kind, showRetry) {
        return '<div class="state-msg ' + kind + '">' + escapeHtml(message) + '</div>' +
            (showRetry ? '<button type="button" class="btn-retry" id="retryAvailability">Retry</button>' : '');
    }

    function setAvailabilityBody(html) {
        var node = el('availabilityResult');
        if (node) node.innerHTML = html;
    }

    function wireRetry(key) {
        var retry = el('retryAvailability');
        if (retry) {
            retry.addEventListener('click', function () { selectCell(key); });
        }
    }

    // ------------------------------------------------------------- the flow

    function selectCell(key) {
        var metadata = cellMetadata[key];
        if (!metadata) return;

        markSelected(key);
        renderPanel(metadata, availabilityLoadingHtml());

        var token = ++requestToken;

        fetch(AVAILABILITY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                day: metadata.day,
                period: metadata.period,
                class: metadata.class,
                subject: metadata.subject,
                faculty: metadata.faculty,
                room: metadata.room
            })
        }).then(function (response) {
            return response.json()
                .catch(function () { return null; })
                .then(function (data) { return { ok: response.ok, status: response.status, data: data }; });
        }).then(function (result) {
            // A newer click has already superseded this response.
            if (token !== requestToken) return;

            if (!result.ok) {
                var reason = result.data && result.data.error
                    ? result.data.error
                    : 'Availability request failed (HTTP ' + result.status + ').';
                setAvailabilityBody(availabilityMessageHtml(reason, 'state-error', true));
                wireRetry(key);
                return;
            }

            var names = (result.data && result.data.availableFaculty) || [];
            if (names.length === 0) {
                setAvailabilityBody(availabilityMessageHtml(
                    'No faculty available for this period.', 'state-none', false));
                return;
            }

            setAvailabilityBody(availabilityListHtml(names));
        }).catch(function () {
            if (token !== requestToken) return;
            setAvailabilityBody(availabilityMessageHtml(
                'Could not reach the server. Check your connection and try again.', 'state-error', true));
            wireRetry(key);
        });
    }

    // ------------------------------------------------------------- startup

    function loadTimetable() {
        setTimetableState('Loading timetable…', 'state-loading');

        fetch(TIMETABLE_URL).then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        }).then(function (timetable) {
            if (!timetable || !Array.isArray(timetable.cells) || timetable.cells.length === 0) {
                throw new Error('empty timetable');
            }
            renderTimetable(timetable);
        }).catch(function () {
            var head = el('timetableHead');
            var body = el('timetableBody');
            if (head) head.innerHTML = '';
            if (body) body.innerHTML = '';
            setTimetableState('Could not load the timetable. Please try again.', 'state-error');

            var node = el('timetableState');
            if (node && !el('retryTimetable')) {
                var retry = document.createElement('button');
                retry.type = 'button';
                retry.id = 'retryTimetable';
                retry.className = 'btn-retry';
                retry.textContent = 'Retry';
                retry.addEventListener('click', function () {
                    retry.remove();
                    loadTimetable();
                });
                node.insertAdjacentElement('afterend', retry);
            }
        });
    }

    document.addEventListener('DOMContentLoaded', loadTimetable);

    // Exposed for tests / debugging only — no write operations.
    window.TecSubstitution = {
        selectCell: selectCell,
        getCellMetadata: function () { return cellMetadata; },
        getSelectedKey: function () { return selectedKey; }
    };
})();
