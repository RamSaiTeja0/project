/**
 * TecSubstitution — primary timetable + faculty availability lookup.
 *
 * Flow: render the primary timetable -> user clicks a cell -> POST the cell's
 * day + period to /api/availability -> display the FREE faculty.
 *
 * The timetable itself always comes from the backend — this file contains no
 * timetable data of its own, so there is exactly one source of truth.
 *
 * The availability path is read-only: it never assigns a substitute and never
 * saves a selection. The import panel is the only thing that can change the
 * loaded timetable, and only after the user confirms a validated preview.
 */
(function () {
    'use strict';

    var TIMETABLE_URL = '/api/availability/timetable';
    var AVAILABILITY_URL = '/api/availability';
    var IMPORT_PREVIEW_URL = '/api/import/preview';
    var IMPORT_COMMIT_URL = '/api/import/commit';
    var IMPORT_FORMATS_URL = '/api/import/formats';

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

        var metaNode = el('timetableMeta');
        if (metaNode) {
            var parts = [];
            if (timetable.institution) parts.push('<strong>' + escapeHtml(timetable.institution) + '</strong>');
            if (timetable.branch) parts.push(escapeHtml(timetable.branch));
            if (timetable.semester) parts.push(escapeHtml(timetable.semester));
            if (timetable.shift) parts.push(escapeHtml(timetable.shift));
            if (timetable.academicYear) parts.push('AY ' + escapeHtml(timetable.academicYear));
            if (timetable.effectiveFrom) parts.push('w.e.f. ' + escapeHtml(timetable.effectiveFrom));
            var count = timetable.timetableCount || 1;
            parts.push(count === 1
                ? '1 timetable loaded'
                : count + ' timetables loaded (1 primary + ' + (count - 1) + ' reference)');
            metaNode.innerHTML = parts.join(' &nbsp;·&nbsp; ');
        }

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
                    status: cell.status || 'FREE',
                    spanId: cell.spanId || null,
                    unresolved: cell.subject != null && !cell.faculty
                };
                cellMetadata[key] = metadata;

                var td = document.createElement('td');
                td.className = 'slot';

                var button = document.createElement('button');
                button.type = 'button';
                button.className = 'slot-btn'
                    + (metadata.subject ? '' : ' is-free')
                    + (metadata.unresolved ? ' has-unresolved' : '');
                button.setAttribute('data-key', key);
                // Mirrored onto the DOM so the cell is self-describing.
                button.setAttribute('data-day', metadata.day);
                button.setAttribute('data-period', String(metadata.period));
                button.setAttribute('data-class', metadata.class || '');
                button.setAttribute('data-subject', metadata.subject || '');
                button.setAttribute('data-faculty', metadata.faculty || '');
                button.setAttribute('data-room', metadata.room || '');
                button.setAttribute('data-span-id', metadata.spanId || '');
                button.setAttribute('aria-label',
                    metadata.day + ' Period ' + metadata.period +
                    (metadata.subject
                        ? ' — ' + metadata.subject + ', ' + (metadata.faculty || 'faculty unresolved')
                        : ' — free'));

                if (metadata.subject) {
                    button.innerHTML =
                        '<div class="slot-subject">' + escapeHtml(metadata.subject) + '</div>' +
                        (metadata.faculty
                            ? '<div class="slot-faculty">' + escapeHtml(metadata.faculty) + '</div>'
                            : '<div class="slot-faculty is-unresolved">Faculty unresolved</div>') +
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
                (metadata.faculty
                    ? '<span class="meta-value">' + escapeHtml(metadata.faculty) + '</span>'
                    : '<span class="meta-value is-unresolved">' +
                      (metadata.subject ? 'Faculty unresolved' : '—') + '</span>') +
                '</div>' +
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

    function availabilityListHtml(names, timetablesChecked) {
        return '<ul class="faculty-list">' + names.map(function (name) {
            return '<li><span class="dot"></span>' + escapeHtml(name) + '</li>';
        }).join('') + '</ul>' +
            (timetablesChecked
                ? '<p class="checked-note">Free across all ' + escapeHtml(timetablesChecked) +
                  ' loaded timetable' + (timetablesChecked === 1 ? '' : 's') + '.</p>'
                : '');
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

            setAvailabilityBody(availabilityListHtml(names, result.data.timetablesChecked));
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

    // ------------------------------------------------------------- import

    // The parsed-but-not-yet-loaded file, held only for the confirm step.
    var pendingImport = null;

    function reportListHtml(report) {
        var items = [];
        (report.errors || []).forEach(function (e) {
            items.push('<li class="report-error"><strong>' + escapeHtml(e.code) + '</strong> — ' +
                escapeHtml(e.message) + '</li>');
        });
        (report.warnings || []).forEach(function (w) {
            items.push('<li class="report-warning"><strong>' + escapeHtml(w.code) + '</strong> — ' +
                escapeHtml(w.message) + '</li>');
        });
        return items.length ? '<ul class="report-list">' + items.join('') + '</ul>' : '';
    }

    function previewTableHtml(preview) {
        return (preview || []).map(function (dayRow) {
            var rows = dayRow.periods.map(function (slot) {
                if (slot.empty) {
                    return '<tr><td>P' + escapeHtml(slot.period) + '</td>' +
                        '<td colspan="2" class="unresolved">no entry</td></tr>';
                }
                return '<tr><td>P' + escapeHtml(slot.period) + '</td>' +
                    '<td>' + escapeHtml(slot.subject) + '</td>' +
                    '<td' + (slot.unresolved ? ' class="unresolved"' : '') + '>' +
                    escapeHtml(slot.facultyLabel) + '</td></tr>';
            }).join('');
            return '<div class="preview-day">' + escapeHtml(dayRow.day) + '</div>' +
                '<table class="preview-table"><thead><tr>' +
                '<th style="width:56px;">Period</th><th>Subject</th><th>Faculty</th>' +
                '</tr></thead><tbody>' + rows + '</tbody></table>';
        }).join('');
    }

    function renderImportResult(data) {
        var node = el('importResult');
        if (!node) return;

        var summary = data.report.summary || {};
        var canLoad = data.report.ok;

        node.innerHTML =
            '<div class="state-msg ' + (canLoad ? 'state-loading' : 'state-error') + '">' +
                escapeHtml(data.filename) + ' — parsed as ' + escapeHtml(data.format) + '. ' +
                escapeHtml(summary.cells || 0) + ' cells, ' +
                escapeHtml(summary.faculty || 0) + ' faculty, ' +
                escapeHtml(summary.unresolvedCells || 0) + ' unresolved.' +
            '</div>' +
            reportListHtml(data.report) +
            previewTableHtml(data.preview) +
            '<div class="import-row" style="margin-top:14px;">' +
                (canLoad
                    ? '<button type="button" class="btn" id="importConfirmBtn">Load this timetable</button>'
                    : '<span class="state-msg state-error">Validation failed — this file cannot be loaded.</span>') +
                '<button type="button" class="btn btn-secondary" id="importCancelBtn">Cancel</button>' +
            '</div>';

        var cancel = el('importCancelBtn');
        if (cancel) cancel.addEventListener('click', clearImport);

        var confirm = el('importConfirmBtn');
        if (confirm) confirm.addEventListener('click', commitImport);
    }

    function clearImport() {
        pendingImport = null;
        var node = el('importResult');
        if (node) node.innerHTML = '';
        var input = el('importFile');
        if (input) input.value = '';
    }

    function showImportMessage(message, kind) {
        var node = el('importResult');
        if (node) node.innerHTML = '<div class="state-msg ' + kind + '">' + escapeHtml(message) + '</div>';
    }

    function sendImport(url, file) {
        var form = new FormData();
        form.append('timetable', file);
        return fetch(url, { method: 'POST', body: form }).then(function (response) {
            return response.json()
                .catch(function () { return null; })
                .then(function (data) { return { ok: response.ok, status: response.status, data: data }; });
        });
    }

    function previewImport() {
        var input = el('importFile');
        var file = input && input.files && input.files[0];
        if (!file) {
            showImportMessage('Choose a file first.', 'state-none');
            return;
        }

        showImportMessage('Parsing ' + file.name + '…', 'state-loading');

        sendImport(IMPORT_PREVIEW_URL, file).then(function (result) {
            if (!result.ok) {
                var message = (result.data && result.data.error) || ('Import failed (HTTP ' + result.status + ').');
                showImportMessage(message, 'state-error');
                if (result.data && result.data.report) {
                    var node = el('importResult');
                    if (node) node.innerHTML += reportListHtml(result.data.report);
                }
                return;
            }
            pendingImport = file;
            renderImportResult(result.data);
        }).catch(function () {
            showImportMessage('Could not reach the server while importing.', 'state-error');
        });
    }

    function commitImport() {
        if (!pendingImport) return;
        showImportMessage('Loading timetable…', 'state-loading');

        sendImport(IMPORT_COMMIT_URL, pendingImport).then(function (result) {
            if (!result.ok) {
                var message = (result.data && result.data.error) || ('Import failed (HTTP ' + result.status + ').');
                showImportMessage(message + ' The previous timetable is still loaded.', 'state-error');
                return;
            }
            clearImport();
            showImportMessage('Timetable loaded from ' + result.data.filename + '.', 'state-none');
            // Re-render from the backend — the frontend holds no timetable of its own.
            loadTimetable();
            var panel = el('resultPanel');
            if (panel) {
                panel.innerHTML = '<p class="panel-empty" id="panelPlaceholder">' +
                    'Select a period from the timetable to see the available faculty.</p>';
            }
        }).catch(function () {
            showImportMessage('Could not reach the server while importing.', 'state-error');
        });
    }

    function loadImportFormats() {
        fetch(IMPORT_FORMATS_URL).then(function (r) { return r.json(); }).then(function (formats) {
            var node = el('importFormats');
            if (!node) return;
            node.textContent = 'Supported: ' + (formats.supported || []).join(' | ') +
                (formats.image && !formats.image.ready
                    ? ' — image extraction is not implemented yet; use CSV or Excel.'
                    : '');
        }).catch(function () { /* keep the static hint */ });
    }

    function wireImport() {
        var button = el('importPreviewBtn');
        if (button) button.addEventListener('click', previewImport);
        loadImportFormats();
    }

    document.addEventListener('DOMContentLoaded', function () {
        loadTimetable();
        wireImport();
    });

    // Exposed for tests / debugging only — no write operations.
    window.TecSubstitution = {
        selectCell: selectCell,
        getCellMetadata: function () { return cellMetadata; },
        getSelectedKey: function () { return selectedKey; }
    };
})();
