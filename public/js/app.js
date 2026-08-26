// Global State
let currentUser = null;
let currentTimetable = [];

// DOM Elements
const loginOverlay = document.getElementById('login-overlay');
const loginForm = document.getElementById('loginForm');
const userProfile = document.getElementById('user-profile');
const logoutBtn = document.getElementById('logoutBtn');
const timetableBody = document.getElementById('timetableBody');
const subForm = document.getElementById('subForm');
const subTimetableSelect = document.getElementById('subTimetable');
const subFacultySelect = document.getElementById('subFaculty');
const subDateInput = document.getElementById('subDate');
const myDutiesBody = document.getElementById('myDutiesBody');
const myRequestsBody = document.getElementById('myRequestsBody');

// ================= AUTH =================
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
});

async function checkSession() {
    try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
            currentUser = await res.json();
            loginOverlay.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'inline-block';
            userProfile.innerText = `${currentUser.full_name} (${currentUser.role.toUpperCase()} - ${currentUser.faculty_id})`;
            loadBranches();
            loadMyDuties();
            loadMyRequests();
        } else {
            loginOverlay.style.display = 'flex';
            if (logoutBtn) logoutBtn.style.display = 'none';
        }
    } catch (e) {
        console.error("Auth check failed", e);
        loginOverlay.style.display = 'flex';
    }
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const faculty_id = document.getElementById('loginFacultyId').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    errorDiv.innerText = '';

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ faculty_id, password })
        });
        const data = await res.json();
        
        if (res.ok) {
            currentUser = data.user;
            loginOverlay.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'inline-block';
            userProfile.innerText = `${currentUser.full_name} (${currentUser.role.toUpperCase()} - ${currentUser.faculty_id})`;
            loadBranches();
            loadMyDuties();
            loadMyRequests();
        } else {
            errorDiv.innerText = data.error || 'Invalid credentials';
        }
    } catch (e) {
        errorDiv.innerText = 'Login request failed. Server might be restarting.';
    }
});

window.logout = async function() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
        console.error("Logout request failed", e);
    }
    currentUser = null;
    currentTimetable = [];
    loginOverlay.style.display = 'flex';
    if (logoutBtn) logoutBtn.style.display = 'none';
    userProfile.innerText = '';
    document.getElementById('loginPassword').value = '';
};

// ================= TIMETABLE =================
async function loadBranches() {
    loadTimetable(1);
}

async function loadTimetable(branchId) {
    try {
        const res = await fetch(`/api/timetable/${branchId}`);
        if (!res.ok) throw new Error('Failed to fetch timetable');
        
        currentTimetable = await res.json();
        renderTimetable(currentTimetable);
        populateSubstituteDropdown(currentTimetable);
    } catch (e) {
        console.error("Error loading timetable:", e);
    }
}

function renderTimetable(entries) {
    timetableBody.innerHTML = '';
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Group by day
    const schedule = {};
    days.forEach(d => schedule[d] = {1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null});
    
    entries.forEach(entry => {
        if (schedule[entry.day]) {
            schedule[entry.day][entry.period] = entry;
        }
    });

    const isEditable = currentUser && currentUser.role === 'hos' ? 'contenteditable="true"' : '';

    days.forEach(day => {
        if (day === 'Saturday' && !schedule[day][1]) return; 

        let tr = `<tr><td><strong>${day}</strong></td>`;
        for (let i = 1; i <= 7; i++) {
            // Insert break column after P3
            if (i === 4) {
                tr += `<td style="background:#fef9c3; text-align:center; color:#92400e; font-size:0.8rem; white-space:nowrap;">☕<br><small>10:15–10:30</small></td>`;
            }
            const cls = schedule[day][i];
            if (cls) {
                tr += `<td style="cursor:pointer;" title="Click for details" onclick="showPeriodModal(${cls.id})">${cls.subject_code} <span style="font-size:0.75rem;color:#94a3b8;">(${cls.faculty_name})</span></td>`;
            } else {
                tr += `<td ${isEditable}><span style="color:#94a3b8;">Free</span></td>`;
            }
        }
        tr += `</tr>`;
        timetableBody.innerHTML += tr;
    });
}

// ================= PERIOD DETAIL MODAL =================
window.showPeriodModal = async function(timetableId) {
    const overlay = document.getElementById('period-modal-overlay');
    const content = document.getElementById('period-modal-content');
    overlay.style.display = 'flex';
    content.innerHTML = '<p style="color:#94a3b8; text-align:center;">⏳ Loading...</p>';

    try {
        const today = new Date().toISOString().split('T')[0];
        const res = await fetch(`/api/substitutions/detail/${timetableId}?date=${today}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        const { slot, substitution } = data;

        const statusBadge = substitution
            ? (substitution.status === 'attended'
                ? '<span style="background:#22c55e22;color:#22c55e;padding:2px 10px;border-radius:20px;font-size:0.8rem;">✅ Attended</span>'
                : '<span style="background:#f59e0b22;color:#f59e0b;padding:2px 10px;border-radius:20px;font-size:0.8rem;">⏳ Assigned</span>')
            : '<span style="background:#3b82f622;color:#60a5fa;padding:2px 10px;border-radius:20px;font-size:0.8rem;">📅 No Sub Today</span>';

        content.innerHTML = `
            <h3 style="color:#f1f5f9;margin:0 0 4px;">📘 ${slot.subject_name} <small style="color:#94a3b8;font-size:0.85rem;">(${slot.subject_code})</small></h3>
            <p style="color:#64748b;font-size:0.8rem;margin:0 0 16px;">${slot.day} · P${slot.period} · ${slot.start_time}–${slot.end_time} · ${slot.room || 'No Room'}</p>

            <div style="background:#0f172a;border-radius:10px;padding:14px 16px;margin-bottom:12px;">
                <p style="margin:0 0 4px;color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;">Original Teacher</p>
                <p style="margin:0;color:#f1f5f9;font-size:1rem;font-weight:600;">👨‍🏫 ${slot.faculty_name}</p>
                <p style="margin:4px 0 0;color:#60a5fa;font-size:0.9rem;">📞 <a href="tel:${slot.faculty_phone}" style="color:#60a5fa;text-decoration:none;">${slot.faculty_phone || 'N/A'}</a></p>
            </div>

            ${substitution ? `
            <div style="background:#0f172a;border-radius:10px;padding:14px 16px;border-left:3px solid #8b5cf6;">
                <p style="margin:0 0 4px;color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;">Substitute Teacher (Today)</p>
                <p style="margin:0;color:#f1f5f9;font-size:1rem;font-weight:600;">👩‍🏫 ${substitution.substitute_name}</p>
                <p style="margin:4px 0 0;color:#a78bfa;font-size:0.9rem;">📞 <a href="tel:${substitution.substitute_phone}" style="color:#a78bfa;text-decoration:none;">${substitution.substitute_phone || 'N/A'}</a></p>
                <p style="margin:6px 0 0;">${statusBadge}</p>
            </div>
            ` : `<div style="background:#0f172a;border-radius:10px;padding:12px 16px;text-align:center;color:#64748b;">${statusBadge} No substitute assigned for today</div>`}
        `;
    } catch (e) {
        content.innerHTML = '<p style="color:#ef4444;">Failed to load period details.</p>';
    }
};

window.closePeriodModal = function() {
    document.getElementById('period-modal-overlay').style.display = 'none';
};

// Close modal when clicking outside
document.getElementById('period-modal-overlay')?.addEventListener('click', function(e) {
    if (e.target === this) closePeriodModal();
});

// ================= SUBSTITUTE =================
function populateSubstituteDropdown(entries) {
    subTimetableSelect.innerHTML = '<option value="">-- Select Period --</option>';
    entries.forEach(entry => {
        if (currentUser.role === 'hos' || entry.faculty_id === currentUser.id) {
            const opt = document.createElement('option');
            opt.value = entry.id;
            opt.dataset.day = entry.day;
            opt.dataset.period = entry.period;
            opt.textContent = `${entry.day} Period ${entry.period} - ${entry.subject_name}`;
            subTimetableSelect.appendChild(opt);
        }
    });
}

window.checkAvailability = async function() {
    const date = subDateInput.value;
    const selectedOption = subTimetableSelect.options[subTimetableSelect.selectedIndex];
    
    if (!date || !selectedOption || !selectedOption.value) {
        subFacultySelect.innerHTML = '<option value="">-- Select Available Faculty --</option>';
        return;
    }

    const day = selectedOption.dataset.day;
    const period = selectedOption.dataset.period;

    // Convert selected Date string to the correct Day of Week using local timezone
    const [year, month, dayNum] = date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, dayNum);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const selectedDayName = dayNames[dateObj.getDay()];

    if (selectedDayName !== day) {
        alert(`Warning: The selected date is a ${selectedDayName}, but the timetable period is on a ${day}.`);
    }

    try {
        const res = await fetch(`/api/substitutions/available?date=${date}&day=${day}&period=${period}`);
        if (!res.ok) throw new Error('Failed to fetch available faculty');
        
        const facultyList = await res.json();
        subFacultySelect.innerHTML = '<option value="">-- Select Available Faculty --</option>';
        
        if (facultyList.length === 0) {
            subFacultySelect.innerHTML = '<option value="">-- No Free Faculty Found --</option>';
            return;
        }

        facultyList.forEach(fac => {
            const opt = document.createElement('option');
            opt.value = fac.id;
            opt.textContent = `${fac.full_name} (${fac.department})`;
            subFacultySelect.appendChild(opt);
        });

    } catch (e) {
        console.error(e);
    }
}

if (subForm) {
    subForm.addEventListener("submit", async function(event) {
        event.preventDefault();
        
        const date = subDateInput.value;
        const timetable_id = subTimetableSelect.value;
        const substitute_faculty_id = subFacultySelect.value;

        if (!date || !timetable_id || !substitute_faculty_id) {
            alert("Please select all fields.");
            return;
        }

        try {
            const res = await fetch('/api/substitutions/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timetable_id, date, substitute_faculty_id })
            });
            const data = await res.json();
            
            if (res.ok) {
                alert("Substitute request sent and assigned successfully!");
                subForm.reset();
                subFacultySelect.innerHTML = '<option value="">-- Select Available Faculty --</option>';
                loadMyDuties();
                loadMyRequests();
            } else {
                alert("Error: " + (data.error || 'Failed to assign substitute'));
            }
        } catch (e) {
            alert("Request failed. Please check your connection.");
        }
    });
}

// Substitute teacher marks duty as Attended / Assigned
window.markDutyAttended = async function(dutyId, isChecked) {
    const status = isChecked ? 'attended' : 'assigned';
    try {
        const res = await fetch(`/api/substitutions/status/${dutyId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        const data = await res.json();
        
        if (res.ok) {
            alert(isChecked ? "Great! Marked as Attended. The original teacher has been notified." : "Marked as pending.");
            loadMyDuties();
            loadMyRequests();
        } else {
            alert("Error: " + (data.error || "Could not update status"));
            loadMyDuties();
        }
    } catch (e) {
        alert("Failed to update status. Please try again.");
    }
};

// Load duties assigned to ME to substitute
async function loadMyDuties() {
    if (!myDutiesBody) return;
    try {
        const res = await fetch('/api/substitutions/my-duties');
        if (!res.ok) return;
        const duties = await res.json();
        
        if (duties.length === 0) {
            myDutiesBody.innerHTML = '<tr><td colspan="7" style="color:#94a3b8;">No substitute duties assigned.</td></tr>';
            return;
        }

        myDutiesBody.innerHTML = duties.map(d => {
            const isAttended = d.status === 'attended';
            return `
            <tr style="${isAttended ? 'background: #f0fdf4;' : ''}">
                <td><strong>${d.date}</strong></td>
                <td>${d.day} P${d.period} <span style="font-size:0.75rem; color:#64748b;">(${d.start_time || ''} - ${d.end_time || ''})</span></td>
                <td>${d.subject_name}</td>
                <td>${d.branch_name}</td>
                <td>${d.room || 'N/A'}</td>
                <td>${d.original_faculty_name}</td>
                <td>
                    <label style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px 8px; border-radius: 6px; ${isAttended ? 'background: #dcfce7;' : 'background: #f1f5f9;'}">
                        <input type="checkbox" ${isAttended ? 'checked' : ''} onchange="markDutyAttended(${d.id}, this.checked)" style="width: 16px; height: 16px; cursor: pointer;" />
                        <span style="font-size: 0.8rem; font-weight: 600; color: ${isAttended ? '#15803d' : '#475569'};">
                            ${isAttended ? '✅ Attended' : 'Mark Attended'}
                        </span>
                    </label>
                </td>
            </tr>
            `;
        }).join('');
    } catch (e) {
        console.error("Failed to load duties", e);
    }
}

// Load requests sent by ME to other substitute teachers
async function loadMyRequests() {
    if (!myRequestsBody) return;
    try {
        const res = await fetch('/api/substitutions/my-requests');
        if (!res.ok) return;
        const requests = await res.json();

        if (requests.length === 0) {
            myRequestsBody.innerHTML = '<tr><td colspan="7" style="color:#94a3b8;">No substitution requests sent.</td></tr>';
            return;
        }

        myRequestsBody.innerHTML = requests.map(r => {
            const isAttended = r.status === 'attended';
            const statusBadge = isAttended
                ? '<span style="background: #dcfce7; color: #15803d; padding: 4px 10px; border-radius: 9999px; font-weight: 700; font-size: 0.78rem;">✅ Class Conducted (Attended)</span>'
                : '<span style="background: #fef9c3; color: #854d0e; padding: 4px 10px; border-radius: 9999px; font-weight: 700; font-size: 0.78rem;">⏳ Assigned (Pending Class)</span>';

            return `
            <tr style="${isAttended ? 'background: #f0fdf4;' : ''}">
                <td><strong>${r.date}</strong></td>
                <td>${r.day} P${r.period} <span style="font-size:0.75rem; color:#64748b;">(${r.start_time || ''} - ${r.end_time || ''})</span></td>
                <td>${r.subject_name}</td>
                <td>${r.branch_name}</td>
                <td>${r.room || 'N/A'}</td>
                <td><strong>${r.substitute_faculty_name}</strong></td>
                <td>${statusBadge}</td>
            </tr>
            `;
        }).join('');
    } catch (e) {
        console.error("Failed to load requests", e);
    }
}

// ================= TAB SWITCHING & OCR =================
window.switchTab = function(tabId, clickedButton) {
    document.querySelectorAll('.tab-content').forEach(section => {
        section.classList.remove('active');
    });
    document.querySelectorAll('nav button').forEach(button => {
        button.classList.remove('active');
    });
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');
    if (clickedButton) clickedButton.classList.add('active');

    if (tabId === 'substitute') {
        loadMyDuties();
        loadMyRequests();
    }
}

window.saveSchedule = function() {
    if (!currentUser || currentUser.role !== 'hos') {
        alert("Only HOS can edit the official timetable.");
        return;
    }
    alert("Timetable edits confirmed.");
}

window.processImage = async function() {
    const fileInput = document.getElementById('imageInput');
    const status = document.getElementById('ocrStatus');
    const result = document.getElementById('ocrResult');

    if (!fileInput.files[0]) {
        alert('Please choose an image file first!');
        return;
    }

    status.innerText = "Scanning timetable image... Please wait.";
    result.innerText = "";

    try {
        const worker = await Tesseract.createWorker('eng');
        const ret = await worker.recognize(fileInput.files[0]);
        status.innerText = "Scanning complete!";
        result.innerText = ret.data.text;
        await worker.terminate();
    } catch (err) {
        status.innerText = "Error scanning image. Please ensure you are running on http://localhost:3000.";
        console.error(err);
    }
}
