// Global State
let currentUser = null;
let currentTimetable = [];

// DOM Elements
const loginOverlay = document.getElementById('login-overlay');
const loginForm = document.getElementById('loginForm');
const userProfile = document.getElementById('user-profile');
const timetableBody = document.getElementById('timetableBody');
const subTimetableSelect = document.getElementById('subTimetable');
const subFacultySelect = document.getElementById('subFaculty');
const subDateInput = document.getElementById('subDate');

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
            userProfile.innerText = `${currentUser.full_name} (${currentUser.role.toUpperCase()} - ${currentUser.faculty_id})`;
            loadBranches();
        } else {
            loginOverlay.style.display = 'flex';
        }
    } catch (e) {
        console.error("Auth check failed", e);
    }
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const faculty_id = document.getElementById('loginFacultyId').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');

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
            userProfile.innerText = `${currentUser.full_name} (${currentUser.role.toUpperCase()} - ${currentUser.faculty_id})`;
            loadBranches();
        } else {
            errorDiv.innerText = data.error;
        }
    } catch (e) {
        errorDiv.innerText = 'Login request failed.';
    }
});

// ================= TIMETABLE =================
async function loadBranches() {
    // For simplicity, we just load branch ID 1 (CSE-A) as demo.
    // In a full app, we would add a Branch select dropdown above the timetable.
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
        console.error(e);
    }
}

function renderTimetable(entries) {
    timetableBody.innerHTML = '';
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Group by day
    const schedule = {};
    days.forEach(d => schedule[d] = {1: null, 2: null, 3: null, 4: null});
    
    entries.forEach(entry => {
        if (schedule[entry.day]) {
            schedule[entry.day][entry.period] = entry;
        }
    });

    const isEditable = currentUser.role === 'hos' ? 'contenteditable="true"' : '';

    days.forEach(day => {
        // Only render days that have classes, or just render Mon-Fri
        if (day === 'Saturday' && !schedule[day][1]) return; 

        let tr = `<tr><td>${day}</td>`;
        for (let i = 1; i <= 4; i++) {
            const cls = schedule[day][i];
            const text = cls ? `${cls.subject_code} (${cls.faculty_name})` : 'Free';
            tr += `<td ${isEditable}>${text}</td>`;
        }
        tr += `</tr>`;
        timetableBody.innerHTML += tr;
    });
}

// ================= SUBSTITUTE =================
function populateSubstituteDropdown(entries) {
    subTimetableSelect.innerHTML = '<option value="">-- Select Period --</option>';
    entries.forEach(entry => {
        // Only allow faculty to substitute their OWN classes (or if HOS, maybe any)
        if (currentUser.role === 'hos' || entry.faculty_id === currentUser.id) {
            const opt = document.createElement('option');
            opt.value = entry.id;
            opt.dataset.day = entry.day;
            opt.dataset.period = entry.period;
            opt.textContent = `${entry.day} P${entry.period} - ${entry.subject_name}`;
            subTimetableSelect.appendChild(opt);
        }
    });
}

window.checkAvailability = async function() {
    const date = subDateInput.value;
    const selectedOption = subTimetableSelect.options[subTimetableSelect.selectedIndex];
    
    if (!date || !selectedOption.value) {
        subFacultySelect.innerHTML = '<option value="">-- Select Available Faculty --</option>';
        return;
    }

    const day = selectedOption.dataset.day;
    const period = selectedOption.dataset.period;

    // We must convert selected Date to the correct Day of Week to ensure it matches the Timetable day
    const dateObj = new Date(date);
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

document.getElementById("subForm").addEventListener("submit", async function(event) {
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
        } else {
            alert("Error: " + data.error);
        }
    } catch (e) {
        alert("Request failed.");
    }
});


// ================= TAB SWITCHING & OCR =================
window.switchTab = function(tabId, clickedButton) {
    document.querySelectorAll('.tab-content').forEach(section => {
        section.classList.remove('active');
    });
    document.querySelectorAll('nav button').forEach(button => {
        button.classList.remove('active');
    });
    document.getElementById(tabId).classList.add('active');
    clickedButton.classList.add('active');
}

window.saveSchedule = function() {
    if (currentUser.role !== 'hos') {
        alert("Only HOS can edit the official timetable.");
        return;
    }
    alert("In a full app, this would parse the table and send PUT requests to the server.");
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
        status.innerText = "Error scanning image.";
        console.error(err);
    }
}
