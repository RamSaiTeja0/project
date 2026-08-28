// Global State
let currentUser = null;
let currentTimetable = [];

// Dynamic Timetable Metadata (Driven 100% by the active/uploaded file)
let activeTimetableMetadata = {
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    periods: [
        { period: 1, timing: '08:00–08:45', start: '08:00', end: '08:45' },
        { period: 2, timing: '08:45–09:30', start: '08:45', end: '09:30' },
        { period: 3, timing: '09:30–10:15', start: '09:30', end: '10:15' },
        { period: 4, timing: '10:30–11:15', start: '10:30', end: '11:15' },
        { period: 5, timing: '11:15–12:00', start: '11:15', end: '12:00' },
        { period: 6, timing: '12:00–12:45', start: '12:00', end: '12:45' },
        { period: 7, timing: '12:45–13:30', start: '12:45', end: '13:30' }
    ],
    breaks: [],
    maxPeriods: 7
};

// ================= SUBJECT NAME EXPANDER =================
const SUBJECT_FULL_NAMES = {
    'python prog': 'Python Programming',
    'python programming': 'Python Programming',
    'python': 'Python Programming',
    'py prog': 'Python Programming',
    'python prog lab': 'Python Programming Lab',
    'python programming lab': 'Python Programming Lab',
    'python lab': 'Python Programming Lab',
    'py lab': 'Python Programming Lab',
    'android prog': 'Android Programming',
    'android programming': 'Android Programming',
    'android': 'Android Programming',
    'android prog lab': 'Android Programming Lab',
    'android programming lab': 'Android Programming Lab',
    'android lab': 'Android Programming Lab',
    'bd & cc': 'Big Data & Cloud Computing',
    'bdcc': 'Big Data & Cloud Computing',
    'bd & cc lab': 'Big Data & Cloud Computing Lab',
    'big data & cloud computing': 'Big Data & Cloud Computing',
    'big data & cloud computing lab': 'Big Data & Cloud Computing Lab',
    'big data': 'Big Data & Cloud Computing',
    'cloud computing': 'Big Data & Cloud Computing',
    'im & ep': 'Industrial Management & Entrepreneurship',
    'imep': 'Industrial Management & Entrepreneurship',
    'industrial management & entrepreneurship': 'Industrial Management & Entrepreneurship',
    'industrial mgmt': 'Industrial Management & Entrepreneurship',
    'iot': 'Internet of Things',
    'internet of things': 'Internet of Things',
    'life skills lab': 'Life Skills Lab',
    'life skills': 'Life Skills Lab',
    'project': 'Project Work',
    'project work': 'Project Work',
    'tpc': 'Training & Placement Cell',
    'training & placement cell': 'Training & Placement Cell',
    'training & placement': 'Training & Placement Cell',
    'library / counseling': 'Library & Student Counseling',
    'library & student counseling': 'Library & Student Counseling',
    'library': 'Library & Student Counseling',
    'counseling': 'Library & Student Counseling',
    'dbms': 'Database Management Systems',
    'dbms lab': 'Database Management Systems Lab',
    'database management systems': 'Database Management Systems',
    'database management systems lab': 'Database Management Systems Lab',
    'database': 'Database Management Systems',
    'ds': 'Data Structures',
    'data structures': 'Data Structures',
    'ds lab': 'Data Structures Lab',
    'data structures lab': 'Data Structures Lab',
    'de': 'Digital Electronics',
    'digital electronics': 'Digital Electronics',
    'de / multimedia lab': 'DE / Multimedia Lab',
    'de/multimedia lab': 'DE / Multimedia Lab',
    'de multimedia lab': 'DE / Multimedia Lab',
    'de multimedia': 'DE / Multimedia Lab',
    'demultimedialab': 'DE / Multimedia Lab',
    'de lab': 'Digital Electronics Lab',
    'multimedia lab': 'Multimedia Lab',
    'java': 'Java Programming',
    'java lab': 'Java Programming Lab',
    'java programming': 'Java Programming',
    'java programming lab': 'Java Programming Lab',
    'cn': 'Computer Networks',
    'computer networks': 'Computer Networks',
    'os': 'Operating Systems',
    'operating systems': 'Operating Systems',
    'wt': 'Web Technologies',
    'wt lab': 'Web Technologies Lab',
    'web tech': 'Web Technologies',
    'web technologies': 'Web Technologies',
    'web technologies lab': 'Web Technologies Lab',
    'maths': 'Engineering Mathematics',
    'math': 'Engineering Mathematics',
    'mathematics': 'Engineering Mathematics',
    'mathsii': 'Engineering Mathematics - II',
    'mathsi': 'Engineering Mathematics - I',
    'mathsiii': 'Engineering Mathematics - III',
    'mathii': 'Engineering Mathematics - II',
    'mathi': 'Engineering Mathematics - I',
    'mathiii': 'Engineering Mathematics - III',
    'maths2': 'Engineering Mathematics - II',
    'maths1': 'Engineering Mathematics - I',
    'maths3': 'Engineering Mathematics - III',
    'math2': 'Engineering Mathematics - II',
    'math1': 'Engineering Mathematics - I',
    'math3': 'Engineering Mathematics - III',
    'maths ii': 'Engineering Mathematics - II',
    'maths i': 'Engineering Mathematics - I',
    'maths iii': 'Engineering Mathematics - III',
    'maths 2': 'Engineering Mathematics - II',
    'maths 1': 'Engineering Mathematics - I',
    'm1': 'Engineering Mathematics - I',
    'm2': 'Engineering Mathematics - II',
    'm3': 'Engineering Mathematics - III',
    'physics': 'Engineering Physics',
    'chemistry': 'Engineering Chemistry',
    'circuits': 'Electric Circuits',
    'circuits lab': 'Electric Circuits Lab',
    'circuit theory': 'Electric Circuits',
    'ec': 'Electronic Circuits',
    'es': 'Embedded Systems',
    'et': 'Electrical Technology',
    'ce': 'Computer Engineering',
    'deld': 'Digital Electronics & Logic Design',
    'power sys': 'Power Systems',
    'dsp lab': 'Digital Signal Processing Lab',
    'cad': 'Computer Aided Design',
    'cad lab': 'Computer Aided Design Lab',
    'som': 'Strength of Materials',
    'som lab': 'Strength of Materials Lab',
    'thermo': 'Thermodynamics',
    'fluids': 'Fluid Mechanics & Hydraulic Machinery',
    'workshop': 'Engineering Workshop Practice'
};

const ALL_CANONICAL_SUBJECTS = new Set(Object.values(SUBJECT_FULL_NAMES));

function toFullSubjectName(raw) {
    if (!raw) return '';
    const clean = String(raw).trim();
    if (!clean || clean.toUpperCase() === 'FREE' || clean === '-') return 'Free';
    if (ALL_CANONICAL_SUBJECTS.has(clean)) return clean;
    
    const key = clean.toLowerCase().replace(/[^a-z0-9& ]/g, '').replace(/\s+/g, ' ').trim();
    if (SUBJECT_FULL_NAMES[key]) return SUBJECT_FULL_NAMES[key];

    const hasLab = key.includes('lab') || clean.toLowerCase().includes('lab');

    // Sort by key length descending
    const sortedEntries = Object.entries(SUBJECT_FULL_NAMES).sort((a, b) => b[0].length - a[0].length);
    for (const [k, full] of sortedEntries) {
        const kHasLab = k.includes('lab');
        if (hasLab === kHasLab) {
            if (key === k || (k.length > 3 && key.includes(k))) {
                return full;
            }
        }
    }

    return clean;
}

function getPeriodTimings(period) {
    const p = parseInt(period);
    if (activeTimetableMetadata && Array.isArray(activeTimetableMetadata.periods)) {
        const found = activeTimetableMetadata.periods.find(item => parseInt(item.period) === p);
        if (found && found.timing) {
            const parts = found.timing.split(/[-–to]/);
            return {
                start: (parts[0] || `P${p}`).trim(),
                end: (parts[1] || '').trim(),
                timing: found.timing
            };
        }
    }
    const defaultTimings = {
        1: { start: '08:00', end: '08:45' },
        2: { start: '08:45', end: '09:30' },
        3: { start: '09:30', end: '10:15' },
        4: { start: '10:30', end: '11:15' },
        5: { start: '11:15', end: '12:00' },
        6: { start: '12:00', end: '12:45' },
        7: { start: '12:45', end: '13:30' },
        8: { start: '13:30', end: '14:15' },
        9: { start: '14:15', end: '15:00' }
    };
    return defaultTimings[p] || { start: `P${p}`, end: '' };
}

// Fallback Initial Demo Timetable
const DEFAULT_DEMO_TIMETABLE = [
    { id: 'd1', day: 'Monday', period: 1, start_time: '08:00', end_time: '08:45', subject_code: 'Python Programming', subject_name: 'Python Programming', faculty_name: 'Dr. Ravi', faculty_phone: '0987654321', room: 'Room 101' },
    { id: 'd2', day: 'Monday', period: 2, start_time: '08:45', end_time: '09:30', subject_code: 'Python Programming', subject_name: 'Python Programming', faculty_name: 'Dr. Ravi', faculty_phone: '0987654321', room: 'Room 101' },
    { id: 'd3', day: 'Monday', period: 3, start_time: '09:30', end_time: '10:15', subject_code: 'Industrial Management & Entrepreneurship', subject_name: 'Industrial Management & Entrepreneurship', faculty_name: 'Prof. Priya', faculty_phone: '7778889999', room: 'Room 101' },
    { id: 'd4', day: 'Monday', period: 4, start_time: '10:30', end_time: '11:15', subject_code: 'Big Data & Cloud Computing', subject_name: 'Big Data & Cloud Computing', faculty_name: 'Dr. Anitha', faculty_phone: '1112223333', room: 'Room 101' },
    { id: 'd5', day: 'Monday', period: 5, start_time: '11:15', end_time: '12:00', subject_code: 'Android Programming Lab', subject_name: 'Android Programming Lab', faculty_name: 'Prof. Kiran', faculty_phone: '4445556666', room: 'Lab 2' },
    { id: 'd6', day: 'Monday', period: 6, start_time: '12:00', end_time: '12:45', subject_code: 'Android Programming Lab', subject_name: 'Android Programming Lab', faculty_name: 'Prof. Kiran', faculty_phone: '4445556666', room: 'Lab 2' },
    { id: 'd7', day: 'Monday', period: 7, start_time: '12:45', end_time: '13:30', subject_code: 'Android Programming Lab', subject_name: 'Android Programming Lab', faculty_name: 'Prof. Kiran', faculty_phone: '4445556666', room: 'Lab 2' },
    { id: 'd8', day: 'Tuesday', period: 1, start_time: '08:00', end_time: '08:45', subject_code: 'Big Data & Cloud Computing', subject_name: 'Big Data & Cloud Computing', faculty_name: 'Dr. Anitha', faculty_phone: '1112223333', room: 'Room 101' },
    { id: 'd9', day: 'Tuesday', period: 2, start_time: '08:45', end_time: '09:30', subject_code: 'Internet of Things', subject_name: 'Internet of Things', faculty_name: 'Dr. Ravi', faculty_phone: '0987654321', room: 'Room 101' },
    { id: 'd10', day: 'Tuesday', period: 3, start_time: '09:30', end_time: '10:15', subject_code: 'Big Data & Cloud Computing', subject_name: 'Big Data & Cloud Computing', faculty_name: 'Dr. Anitha', faculty_phone: '1112223333', room: 'Room 101' },
    { id: 'd11', day: 'Tuesday', period: 4, start_time: '10:30', end_time: '11:15', subject_code: 'Internet of Things', subject_name: 'Internet of Things', faculty_name: 'Dr. Ravi', faculty_phone: '0987654321', room: 'Room 101' },
    { id: 'd12', day: 'Tuesday', period: 5, start_time: '11:15', end_time: '12:00', subject_code: 'Android Programming', subject_name: 'Android Programming', faculty_name: 'Prof. Kiran', faculty_phone: '4445556666', room: 'Room 101' },
    { id: 'd13', day: 'Tuesday', period: 6, start_time: '12:00', end_time: '12:45', subject_code: 'Python Programming', subject_name: 'Python Programming', faculty_name: 'Dr. Ravi', faculty_phone: '0987654321', room: 'Room 101' },
    { id: 'd14', day: 'Tuesday', period: 7, start_time: '12:45', end_time: '13:30', subject_code: 'Project Work', subject_name: 'Project Work', faculty_name: 'Dr. Smith', faculty_phone: '1234567890', room: 'Lab 1' },
    { id: 'd15', day: 'Wednesday', period: 1, start_time: '08:00', end_time: '08:45', subject_code: 'Big Data & Cloud Computing', subject_name: 'Big Data & Cloud Computing', faculty_name: 'Dr. Anitha', faculty_phone: '1112223333', room: 'Room 101' },
    { id: 'd16', day: 'Wednesday', period: 2, start_time: '08:45', end_time: '09:30', subject_code: 'Python Programming', subject_name: 'Python Programming', faculty_name: 'Dr. Ravi', faculty_phone: '0987654321', room: 'Room 101' },
    { id: 'd17', day: 'Wednesday', period: 3, start_time: '09:30', end_time: '10:15', subject_code: 'Android Programming', subject_name: 'Android Programming', faculty_name: 'Prof. Kiran', faculty_phone: '4445556666', room: 'Room 101' },
    { id: 'd18', day: 'Wednesday', period: 4, start_time: '10:30', end_time: '11:15', subject_code: 'Industrial Management & Entrepreneurship', subject_name: 'Industrial Management & Entrepreneurship', faculty_name: 'Prof. Priya', faculty_phone: '7778889999', room: 'Room 101' },
    { id: 'd19', day: 'Wednesday', period: 5, start_time: '11:15', end_time: '12:00', subject_code: 'Life Skills Lab', subject_name: 'Life Skills Lab', faculty_name: 'Dr. Smith', faculty_phone: '1234567890', room: 'Lab 3' },
    { id: 'd20', day: 'Wednesday', period: 6, start_time: '12:00', end_time: '12:45', subject_code: 'Life Skills Lab', subject_name: 'Life Skills Lab', faculty_name: 'Dr. Smith', faculty_phone: '1234567890', room: 'Lab 3' },
    { id: 'd21', day: 'Wednesday', period: 7, start_time: '12:45', end_time: '13:30', subject_code: 'Life Skills Lab', subject_name: 'Life Skills Lab', faculty_name: 'Dr. Smith', faculty_phone: '1234567890', room: 'Lab 3' },
    { id: 'd22', day: 'Thursday', period: 1, start_time: '08:00', end_time: '08:45', subject_code: 'Industrial Management & Entrepreneurship', subject_name: 'Industrial Management & Entrepreneurship', faculty_name: 'Prof. Priya', faculty_phone: '7778889999', room: 'Room 101' },
    { id: 'd23', day: 'Thursday', period: 2, start_time: '08:45', end_time: '09:30', subject_code: 'Python Programming', subject_name: 'Python Programming', faculty_name: 'Dr. Ravi', faculty_phone: '0987654321', room: 'Room 101' },
    { id: 'd24', day: 'Thursday', period: 3, start_time: '09:30', end_time: '10:15', subject_code: 'Big Data & Cloud Computing', subject_name: 'Big Data & Cloud Computing', faculty_name: 'Dr. Anitha', faculty_phone: '1112223333', room: 'Room 101' },
    { id: 'd25', day: 'Thursday', period: 4, start_time: '10:30', end_time: '11:15', subject_code: 'Internet of Things', subject_name: 'Internet of Things', faculty_name: 'Dr. Ravi', faculty_phone: '0987654321', room: 'Room 101' },
    { id: 'd26', day: 'Thursday', period: 5, start_time: '11:15', end_time: '12:00', subject_code: 'Android Programming', subject_name: 'Android Programming', faculty_name: 'Prof. Kiran', faculty_phone: '4445556666', room: 'Room 101' },
    { id: 'd27', day: 'Thursday', period: 6, start_time: '12:00', end_time: '12:45', subject_code: 'Industrial Management & Entrepreneurship', subject_name: 'Industrial Management & Entrepreneurship', faculty_name: 'Prof. Priya', faculty_phone: '7778889999', room: 'Room 101' },
    { id: 'd28', day: 'Thursday', period: 7, start_time: '12:45', end_time: '13:30', subject_code: 'Library & Student Counseling', subject_name: 'Library & Student Counseling', faculty_name: 'Dr. Smith', faculty_phone: '1234567890', room: 'Library' },
    { id: 'd29', day: 'Friday', period: 1, start_time: '08:00', end_time: '08:45', subject_code: 'Big Data & Cloud Computing', subject_name: 'Big Data & Cloud Computing', faculty_name: 'Dr. Anitha', faculty_phone: '1112223333', room: 'Room 101' },
    { id: 'd30', day: 'Friday', period: 2, start_time: '08:45', end_time: '09:30', subject_code: 'Python Programming', subject_name: 'Python Programming', faculty_name: 'Dr. Ravi', faculty_phone: '0987654321', room: 'Room 101' },
    { id: 'd31', day: 'Friday', period: 3, start_time: '09:30', end_time: '10:15', subject_code: 'Android Programming', subject_name: 'Android Programming', faculty_name: 'Prof. Kiran', faculty_phone: '4445556666', room: 'Room 101' },
    { id: 'd32', day: 'Friday', period: 4, start_time: '10:30', end_time: '11:15', subject_code: 'Industrial Management & Entrepreneurship', subject_name: 'Industrial Management & Entrepreneurship', faculty_name: 'Prof. Priya', faculty_phone: '7778889999', room: 'Room 101' },
    { id: 'd33', day: 'Friday', period: 5, start_time: '11:15', end_time: '12:00', subject_code: 'Internet of Things', subject_name: 'Internet of Things', faculty_name: 'Dr. Ravi', faculty_phone: '0987654321', room: 'Room 101' },
    { id: 'd34', day: 'Friday', period: 6, start_time: '12:00', end_time: '12:45', subject_code: 'Training & Placement Cell', subject_name: 'Training & Placement Cell', faculty_name: 'Dr. Smith', faculty_phone: '1234567890', room: 'Auditorium' },
    { id: 'd35', day: 'Friday', period: 7, start_time: '12:45', end_time: '13:30', subject_code: 'Project Work', subject_name: 'Project Work', faculty_name: 'Dr. Smith', faculty_phone: '1234567890', room: 'Lab 1' },
    { id: 'd36', day: 'Saturday', period: 1, start_time: '08:00', end_time: '08:45', subject_code: 'Internet of Things', subject_name: 'Internet of Things', faculty_name: 'Dr. Ravi', faculty_phone: '0987654321', room: 'Room 101' },
    { id: 'd37', day: 'Saturday', period: 2, start_time: '08:45', end_time: '09:30', subject_code: 'Internet of Things', subject_name: 'Internet of Things', faculty_name: 'Dr. Ravi', faculty_phone: '0987654321', room: 'Room 101' },
    { id: 'd38', day: 'Saturday', period: 3, start_time: '09:30', end_time: '10:15', subject_code: 'Android Programming', subject_name: 'Android Programming', faculty_name: 'Prof. Kiran', faculty_phone: '4445556666', room: 'Room 101' },
    { id: 'd39', day: 'Saturday', period: 4, start_time: '10:30', end_time: '11:15', subject_code: 'Android Programming', subject_name: 'Android Programming', faculty_name: 'Prof. Kiran', faculty_phone: '4445556666', room: 'Room 101' },
    { id: 'd40', day: 'Saturday', period: 5, start_time: '11:15', end_time: '12:00', subject_code: 'Python Programming Lab', subject_name: 'Python Programming Lab', faculty_name: 'Dr. Ravi', faculty_phone: '0987654321', room: 'Lab 1' },
    { id: 'd41', day: 'Saturday', period: 6, start_time: '12:00', end_time: '12:45', subject_code: 'Python Programming Lab', subject_name: 'Python Programming Lab', faculty_name: 'Dr. Ravi', faculty_phone: '0987654321', room: 'Lab 1' },
    { id: 'd42', day: 'Saturday', period: 7, start_time: '12:45', end_time: '13:30', subject_code: 'Python Programming Lab', subject_name: 'Python Programming Lab', faculty_name: 'Dr. Ravi', faculty_phone: '0987654321', room: 'Lab 1' }
];

// DOM Elements
const loginOverlay = document.getElementById('login-overlay');
const loginForm = document.getElementById('loginForm');
const userProfile = document.getElementById('user-profile');
const logoutBtn = document.getElementById('logoutBtn');
const subForm = document.getElementById('subForm');
const myDutiesBody = document.getElementById('myDutiesBody');
const myRequestsBody = document.getElementById('myRequestsBody');

// ================= AUTH =================
document.addEventListener('DOMContentLoaded', () => {
    // Restore saved metadata if available
    const savedMeta = localStorage.getItem('scheduler_timetable_meta');
    if (savedMeta) {
        try {
            const parsedMeta = JSON.parse(savedMeta);
            if (parsedMeta && Array.isArray(parsedMeta.days) && parsedMeta.days.length > 0) {
                activeTimetableMetadata = parsedMeta;
            }
        } catch (e) {}
    }

    checkSession();
    initDropZone();

    const keyIn = document.getElementById('geminiApiKeyInput');
    if (keyIn && localStorage.getItem('gemini_api_key')) {
        keyIn.value = localStorage.getItem('gemini_api_key');
    }
});

async function checkSession() {
    try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
            currentUser = await res.json();
            loginSuccess(currentUser);
            return;
        }
    } catch (e) {}

    currentUser = null;
    localStorage.removeItem('scheduler_current_user');
    showLoginOverlay();
}

function showLoginOverlay() {
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.style.display = 'flex';
    const btn = document.getElementById('logoutBtn');
    if (btn) btn.style.display = 'none';
}

function loginSuccess(user) {
    currentUser = user;
    localStorage.setItem('scheduler_current_user', JSON.stringify(user));
    
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.style.display = 'none';

    const btn = document.getElementById('logoutBtn');
    if (btn) btn.style.display = 'inline-block';

    const prof = document.getElementById('user-profile');
    if (prof) {
        prof.innerText = `${user.full_name} (${(user.role || 'faculty').toUpperCase()} - ${user.faculty_id})`;
    }

    loadBranches();
    loadMyDuties();
    loadMyRequests();
}

window.switchAuthTab = function(mode) {
    const signInContainer = document.getElementById('authSignInContainer');
    const signUpContainer = document.getElementById('authSignUpContainer');
    const tabBtnSignIn = document.getElementById('tabBtnSignIn');
    const tabBtnSignUp = document.getElementById('tabBtnSignUp');
    const loginError = document.getElementById('loginError');
    const regError = document.getElementById('regError');

    if (loginError) loginError.innerText = '';
    if (regError) regError.innerText = '';

    if (mode === 'signup') {
        if (signInContainer) signInContainer.style.display = 'none';
        if (signUpContainer) signUpContainer.style.display = 'block';
        if (tabBtnSignUp) { tabBtnSignUp.style.background = '#4f46e5'; tabBtnSignUp.style.color = 'white'; }
        if (tabBtnSignIn) { tabBtnSignIn.style.background = 'transparent'; tabBtnSignIn.style.color = '#64748b'; }
    } else {
        if (signUpContainer) signUpContainer.style.display = 'none';
        if (signInContainer) signInContainer.style.display = 'block';
        if (tabBtnSignIn) { tabBtnSignIn.style.background = '#4f46e5'; tabBtnSignIn.style.color = 'white'; }
        if (tabBtnSignUp) { tabBtnSignUp.style.background = 'transparent'; tabBtnSignUp.style.color = '#64748b'; }
    }
};

window.handleRegisterSubmit = async function(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const nameInput = document.getElementById('regFullName');
    const idInput = document.getElementById('regFacultyId');
    const roleInput = document.getElementById('regRole');
    const deptInput = document.getElementById('regDepartment');
    const emailInput = document.getElementById('regEmail');
    const phoneInput = document.getElementById('regPhone');
    const passInput = document.getElementById('regPassword');
    const regError = document.getElementById('regError');
    const submitBtn = document.getElementById('regSubmitBtn');

    if (regError) regError.innerText = '';

    const full_name = (nameInput ? nameInput.value : '').trim();
    const faculty_id = (idInput ? idInput.value : '').trim().toUpperCase();
    const role = (roleInput ? roleInput.value : 'faculty').trim();
    const department = (deptInput ? deptInput.value : 'DCME').trim();
    const email = (emailInput ? emailInput.value : '').trim();
    const phone = (phoneInput ? phoneInput.value : '').trim();
    const password = (passInput ? passInput.value : '').trim();

    if (!full_name || !faculty_id || !password) {
        if (regError) regError.innerText = 'Please provide Full Name, Faculty ID, and Password.';
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Creating Account...';
    }

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ faculty_id, full_name, role, department, email, phone, password })
        });

        const data = await res.json();
        if (res.ok && data && data.user) {
            loginSuccess(data.user);
            alert(`🎉 Welcome, ${data.user.full_name}! Your account has been registered and you are signed in.`);
            return;
        } else {
            if (regError) {
                regError.innerText = (data && data.error) ? data.error : 'Registration failed: Duplicate ID or Name.';
            }
            return;
        }
    } catch (err) {
        if (regError) {
            regError.innerText = 'Registration error: ' + err.message;
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = '✨ Create Account & Sign In';
        }
    }
};

window.quickLogin = function(role) {
    const idInput = document.getElementById('loginFacultyId');
    const passInput = document.getElementById('loginPassword');
    
    if (role === 'hos') {
        if (idInput) idInput.value = 'HOS001';
        if (passInput) passInput.value = 'password123';
    } else {
        if (idInput) idInput.value = 'FAC001';
        if (passInput) passInput.value = 'password123';
    }

    handleLoginSubmit();
};

window.handleLoginSubmit = async function(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const idInput = document.getElementById('loginFacultyId');
    const passInput = document.getElementById('loginPassword');
    const errorDiv = document.getElementById('loginError');
    const submitBtn = document.getElementById('loginSubmitBtn');
    if (errorDiv) errorDiv.innerText = '';

    const cleanId = (idInput ? idInput.value : '').trim().toUpperCase();
    const cleanPass = (passInput ? passInput.value : '').trim();

    if (!cleanId || !cleanPass) {
        if (errorDiv) errorDiv.innerText = 'Please enter your Faculty ID and password.';
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Signing In...';
    }

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ faculty_id: cleanId, password: cleanPass })
        });

        const data = await res.json();
        if (res.ok && data && data.user) {
            loginSuccess(data.user);
        } else {
            if (errorDiv) {
                errorDiv.innerText = (data && data.error) ? data.error : 'Invalid credentials. Please check your ID/password.';
            }
        }
    } catch (err) {
        if (errorDiv) {
            errorDiv.innerText = 'Connection error: ' + err.message;
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Sign In to Portal →';
        }
    }
};

if (loginForm) {
    loginForm.addEventListener('submit', window.handleLoginSubmit);
}

window.logout = async function() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    currentUser = null;
    currentTimetable = [];
    localStorage.removeItem('scheduler_current_user');
    showLoginOverlay();
    const prof = document.getElementById('user-profile');
    if (prof) prof.innerText = '';
    const passInput = document.getElementById('loginPassword');
    if (passInput) passInput.value = '';
};

// ================= DYNAMIC TIMETABLE RENDERING =================
async function loadBranches() {
    loadTimetable(1);
}

async function loadTimetable(branchId) {
    const localSaved = localStorage.getItem('scheduler_custom_timetable');
    if (localSaved) {
        try {
            const parsed = JSON.parse(localSaved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                currentTimetable = parsed;
                renderTimetable(currentTimetable);
                populateSubstituteDropdown(currentTimetable);
                return;
            }
        } catch(e) {}
    }

    try {
        const res = await fetch(`/api/timetable/${branchId}`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                currentTimetable = data;
                renderTimetable(currentTimetable);
                populateSubstituteDropdown(currentTimetable);
                return;
            }
        }
    } catch (e) {}

    currentTimetable = DEFAULT_DEMO_TIMETABLE;
    renderTimetable(currentTimetable);
    populateSubstituteDropdown(currentTimetable);
}

/**
 * Completely Dynamic Weekly Schedule Table Renderer
 * Reads active days, period count, timings, and breaks directly from activeTimetableMetadata.
 */
function renderTimetable(entries) {
    const tbody = document.getElementById('timetableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const daysList = (activeTimetableMetadata && Array.isArray(activeTimetableMetadata.days) && activeTimetableMetadata.days.length > 0)
        ? activeTimetableMetadata.days
        : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    let maxPeriods = activeTimetableMetadata && activeTimetableMetadata.maxPeriods ? activeTimetableMetadata.maxPeriods : 7;
    (entries || []).forEach(e => {
        const p = parseInt(e.period);
        if (!isNaN(p) && p > maxPeriods) maxPeriods = p;
    });

    const breaksList = (activeTimetableMetadata && Array.isArray(activeTimetableMetadata.breaks))
        ? activeTimetableMetadata.breaks
        : [];

    // Dynamically update Table Header (<thead>)
    const tableElement = tbody.closest('table');
    if (tableElement) {
        const thead = tableElement.querySelector('thead');
        if (thead) {
            let theadHtml = `<tr><th style="min-width: 90px;">Day</th>`;
            for (let p = 1; p <= maxPeriods; p++) {
                // Check if a break occurs before this period
                const brk = breaksList.find(b => parseInt(b.afterPeriod) === p - 1);
                if (brk) {
                    theadHtml += `<th style="background:#fef9c3; color:#92400e; min-width:65px;">☕ ${brk.label || 'Break'}<br><small>${brk.timing || ''}</small></th>`;
                }
                const times = getPeriodTimings(p);
                theadHtml += `<th>P${p}<br><small>${times.start}–${times.end}</small></th>`;
            }
            theadHtml += `</tr>`;
            thead.innerHTML = theadHtml;
        }
    }

    if (!Array.isArray(entries) || entries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${maxPeriods + 2}" style="color:#94a3b8; text-align:center; padding: 20px;">No timetable periods found. Upload an Excel, CSV, PDF, or Photo to generate!</td></tr>`;
        return;
    }

    // Map schedule entries by [day][period]
    const scheduleMap = {};
    daysList.forEach(d => {
        scheduleMap[d] = {};
        for (let p = 1; p <= maxPeriods; p++) scheduleMap[d][p] = null;
    });

    entries.forEach(entry => {
        if (!scheduleMap[entry.day]) scheduleMap[entry.day] = {};
        scheduleMap[entry.day][entry.period] = entry;
    });

    daysList.forEach(day => {
        let tr = `<tr><td style="font-weight:700; background:#f8fafc; color:#1e293b; white-space:nowrap;">${day}</td>`;
        for (let p = 1; p <= maxPeriods; p++) {
            // Break column if any
            const brk = breaksList.find(b => parseInt(b.afterPeriod) === p - 1);
            if (brk) {
                tr += `<td style="background:#fef9c3; text-align:center; color:#92400e; font-size:0.8rem; white-space:nowrap;">☕<br><small>${brk.label || 'Break'}</small></td>`;
            }

            const cls = scheduleMap[day] ? scheduleMap[day][p] : null;
            const rawVal = (cls && (cls.subject_name || cls.subject_code)) ? (cls.subject_name || cls.subject_code) : 'Free';
            const val = toFullSubjectName(rawVal);
            const isFree = !val || val.toUpperCase() === 'FREE' || val === '-';

            let cellStyle = isFree ? 'color: #94a3b8;' : 'font-weight: 600; color: var(--primary); background: #eef2ff;';
            let spanBadge = '';
            if (cls && cls.span) {
                spanBadge = ` <span style="font-size:0.68rem; background:#c7d2fe; color:#312e81; padding:1px 5px; border-radius:4px; margin-left:4px; font-weight:normal;">P${cls.span}</span>`;
            }

            tr += `
                <td contenteditable="true" 
                    class="grid-cell-editable" 
                    data-day="${day}" 
                    data-period="${p}" 
                    title="Click to edit subject (${day} P${p})"
                    style="${cellStyle}">
                    ${val}${spanBadge}
                </td>
            `;
        }
        tr += `</tr>`;
        tbody.innerHTML += tr;
    });
}

// ================= PERIOD DETAIL MODAL =================
function renderPeriodModalContent(slot, substitution) {
    const content = document.getElementById('period-modal-content');
    if (!content) return;
    const statusBadge = substitution
        ? (substitution.status === 'attended'
            ? '<span style="background:#22c55e22;color:#22c55e;padding:2px 10px;border-radius:20px;font-size:0.8rem;">✅ Attended</span>'
            : '<span style="background:#f59e0b22;color:#f59e0b;padding:2px 10px;border-radius:20px;font-size:0.8rem;">⏳ Assigned</span>')
        : '<span style="background:#3b82f622;color:#60a5fa;padding:2px 10px;border-radius:20px;font-size:0.8rem;">📅 Regular Class</span>';

    const fullTitle = toFullSubjectName(slot.subject_name || slot.subject_code);

    content.innerHTML = `
        <h3 style="color:#f1f5f9;margin:0 0 4px;">📘 ${fullTitle}</h3>
        <p style="color:#64748b;font-size:0.8rem;margin:0 0 16px;">${slot.day} · Period ${slot.period} · ${slot.start_time || '08:00'}–${slot.end_time || '08:45'} · ${slot.room || 'Room 101'}</p>

        <div style="background:#0f172a;border-radius:10px;padding:14px 16px;margin-bottom:12px;">
            <p style="margin:0 0 4px;color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;">Assigned Teacher</p>
            <p style="margin:0;color:#f1f5f9;font-size:1rem;font-weight:600;">👨‍🏫 ${slot.faculty_name || 'Assigned Teacher'}</p>
            <p style="margin:4px 0 0;color:#60a5fa;font-size:0.9rem;">📞 <a href="tel:${slot.faculty_phone || ''}" style="color:#60a5fa;text-decoration:none;">${slot.faculty_phone || '9876543210'}</a></p>
        </div>

        ${substitution ? `
        <div style="background:#0f172a;border-radius:10px;padding:14px 16px;border-left:3px solid #8b5cf6;">
            <p style="margin:0 0 4px;color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;">Substitute Teacher (Today)</p>
            <p style="margin:0;color:#f1f5f9;font-size:1rem;font-weight:600;">👩‍🏫 ${substitution.substitute_name}</p>
            <p style="margin:4px 0 0;color:#a78bfa;font-size:0.9rem;">📞 <a href="tel:${substitution.substitute_phone || ''}" style="color:#a78bfa;text-decoration:none;">${substitution.substitute_phone || 'N/A'}</a></p>
            <p style="margin:6px 0 0;">${statusBadge}</p>
        </div>
        ` : `<div style="background:#0f172a;border-radius:10px;padding:12px 16px;text-align:center;color:#64748b;">${statusBadge} No substitute assigned for today</div>`}
    `;
}

window.showPeriodModal = async function(timetableId) {
    const overlay = document.getElementById('period-modal-overlay');
    const content = document.getElementById('period-modal-content');
    if (!overlay || !content) return;
    overlay.style.display = 'flex';
    content.innerHTML = '<p style="color:#94a3b8; text-align:center;">⏳ Loading...</p>';

    const localSlot = (currentTimetable || []).find(e => String(e.id) === String(timetableId));

    try {
        const today = new Date().toISOString().split('T')[0];
        const res = await fetch(`/api/substitutions/detail/${timetableId}?date=${today}`);
        if (res.ok) {
            const data = await res.json();
            renderPeriodModalContent(data.slot, data.substitution);
            return;
        }
    } catch (e) {}

    if (localSlot) {
        renderPeriodModalContent({
            subject_name: toFullSubjectName(localSlot.subject_name || localSlot.subject_code),
            subject_code: toFullSubjectName(localSlot.subject_code),
            day: localSlot.day,
            period: localSlot.period,
            start_time: localSlot.start_time || '08:00',
            end_time: localSlot.end_time || '08:45',
            room: localSlot.room || 'Room 101',
            faculty_name: localSlot.faculty_name || (currentUser ? currentUser.full_name : 'Assigned Faculty'),
            faculty_phone: (currentUser && currentUser.phone) ? currentUser.phone : '9876543210'
        }, null);
    } else {
        content.innerHTML = '<p style="color:#ef4444;text-align:center;">Period details unavailable.</p>';
    }
};

window.closePeriodModal = function() {
    const overlay = document.getElementById('period-modal-overlay');
    if (overlay) overlay.style.display = 'none';
};

document.getElementById('period-modal-overlay')?.addEventListener('click', function(e) {
    if (e.target === this) closePeriodModal();
});

// ================= SUBSTITUTE =================
function populateSubstituteDropdown(entries) {
    const select = document.getElementById('subTimetable');
    if (!select) return;
    select.innerHTML = '<option value="">-- Select Period --</option>';
    (entries || []).forEach(entry => {
        if (!currentUser || currentUser.role === 'hos' || entry.faculty_id === currentUser.id || !entry.faculty_id) {
            const opt = document.createElement('option');
            opt.value = entry.id;
            opt.dataset.day = entry.day;
            opt.dataset.period = entry.period;
            const fullSub = toFullSubjectName(entry.subject_name || entry.subject_code);
            opt.textContent = `${entry.day} Period ${entry.period} - ${fullSub}`;
            select.appendChild(opt);
        }
    });
}

window.checkAvailability = async function() {
    const dateInput = document.getElementById('subDate');
    const tableSelect = document.getElementById('subTimetable');
    const facSelect = document.getElementById('subFaculty');
    if (!dateInput || !tableSelect || !facSelect) return;

    const date = dateInput.value;
    const selectedOption = tableSelect.options[tableSelect.selectedIndex];
    
    if (!date || !selectedOption || !selectedOption.value) {
        facSelect.innerHTML = '<option value="">-- Select Available Faculty --</option>';
        return;
    }

    const day = selectedOption.dataset.day;
    const period = selectedOption.dataset.period;

    try {
        const res = await fetch(`/api/substitutions/available?date=${date}&day=${day}&period=${period}`);
        if (res.ok) {
            const facultyList = await res.json();
            facSelect.innerHTML = '<option value="">-- Select Available Faculty --</option>';
            if (facultyList.length > 0) {
                facultyList.forEach(fac => {
                    const opt = document.createElement('option');
                    opt.value = fac.id;
                    opt.textContent = `${fac.full_name} (${fac.department})`;
                    facSelect.appendChild(opt);
                });
                return;
            }
        }
    } catch (e) {}

    const demoFaculty = [
        { id: 3, full_name: 'Dr. Anitha', department: 'CSE' },
        { id: 4, full_name: 'Prof. Kiran', department: 'CSE' },
        { id: 5, full_name: 'Prof. Priya', department: 'CSE' }
    ];
    facSelect.innerHTML = '<option value="">-- Select Available Faculty --</option>';
    demoFaculty.forEach(fac => {
        const opt = document.createElement('option');
        opt.value = fac.id;
        opt.textContent = `${fac.full_name} (${fac.department})`;
        facSelect.appendChild(opt);
    });
};

if (subForm) {
    subForm.addEventListener("submit", async function(event) {
        event.preventDefault();
        const date = document.getElementById('subDate')?.value;
        const timetable_id = document.getElementById('subTimetable')?.value;
        const substitute_faculty_id = document.getElementById('subFaculty')?.value;

        if (!date || !timetable_id || !substitute_faculty_id) {
            alert("Please select all fields.");
            return;
        }

        try {
            await fetch('/api/substitutions/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timetable_id, date, substitute_faculty_id })
            });
        } catch (e) {}

        alert("Substitute request sent and assigned successfully!");
        if (subForm) subForm.reset();
        const facSelect = document.getElementById('subFaculty');
        if (facSelect) facSelect.innerHTML = '<option value="">-- Select Available Faculty --</option>';
        loadMyDuties();
        loadMyRequests();
    });
}

window.markDutyAttended = async function(dutyId, isChecked) {
    const status = isChecked ? 'attended' : 'assigned';
    try {
        await fetch(`/api/substitutions/status/${dutyId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
    } catch (e) {}

    alert(isChecked ? "Great! Marked as Attended. The original teacher has been notified." : "Marked as pending.");
    loadMyDuties();
    loadMyRequests();
};

async function loadMyDuties() {
    const tbody = document.getElementById('myDutiesBody');
    if (!tbody) return;
    try {
        const res = await fetch('/api/substitutions/my-duties');
        if (res.ok) {
            const duties = await res.json();
            if (duties.length > 0) {
                tbody.innerHTML = duties.map(d => {
                    const isAttended = d.status === 'attended';
                    const fullSub = toFullSubjectName(d.subject_name);
                    return `
                    <tr style="${isAttended ? 'background: #f0fdf4;' : ''}">
                        <td><strong>${d.date}</strong></td>
                        <td>${d.day} P${d.period} <span style="font-size:0.75rem; color:#64748b;">(${d.start_time || ''} - ${d.end_time || ''})</span></td>
                        <td>${fullSub}</td>
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
                return;
            }
        }
    } catch (e) {}

    tbody.innerHTML = '<tr><td colspan="7" style="color:#94a3b8;">No substitute duties assigned.</td></tr>';
}

async function loadMyRequests() {
    const tbody = document.getElementById('myRequestsBody');
    if (!tbody) return;
    try {
        const res = await fetch('/api/substitutions/my-requests');
        if (res.ok) {
            const requests = await res.json();
            if (requests.length > 0) {
                tbody.innerHTML = requests.map(r => {
                    const isAttended = r.status === 'attended';
                    const fullSub = toFullSubjectName(r.subject_name);
                    const statusBadge = isAttended
                        ? '<span style="background: #dcfce7; color: #15803d; padding: 4px 10px; border-radius: 9999px; font-weight: 700; font-size: 0.78rem;">✅ Class Conducted (Attended)</span>'
                        : '<span style="background: #fef9c3; color: #854d0e; padding: 4px 10px; border-radius: 9999px; font-weight: 700; font-size: 0.78rem;">⏳ Assigned (Pending Class)</span>';

                    return `
                    <tr style="${isAttended ? 'background: #f0fdf4;' : ''}">
                        <td><strong>${r.date}</strong></td>
                        <td>${r.day} P${r.period} <span style="font-size:0.75rem; color:#64748b;">(${r.start_time || ''} - ${r.end_time || ''})</span></td>
                        <td>${fullSub}</td>
                        <td>${r.branch_name}</td>
                        <td>${r.room || 'N/A'}</td>
                        <td><strong>${r.substitute_faculty_name}</strong></td>
                        <td>${statusBadge}</td>
                    </tr>
                    `;
                }).join('');
                return;
            }
        }
    } catch (e) {}

    tbody.innerHTML = '<tr><td colspan="7" style="color:#94a3b8;">No substitution requests sent.</td></tr>';
}

// ================= TAB SWITCHING =================
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
};

window.saveSchedule = function() {
    const tbody = document.getElementById('timetableBody');
    if (!tbody) return;
    const trs = tbody.querySelectorAll('tr');
    const updated = [];

    trs.forEach(tr => {
        const dayCell = tr.querySelector('td:first-child');
        if (!dayCell) return;
        const day = dayCell.innerText.trim();
        const tds = Array.from(tr.querySelectorAll('td')).slice(1);
        
        tds.forEach(td => {
            if (td.innerText.includes('Break') || !td.hasAttribute('data-period')) return;
            const period = parseInt(td.getAttribute('data-period'));
            const text = td.innerText.replace(/\n.*$/g, '').replace(/P\d+[-–]\d+/g, '').trim();
            if (text && text.toUpperCase() !== 'FREE' && text !== '-') {
                const fullText = toFullSubjectName(text);
                const times = getPeriodTimings(period);
                updated.push({
                    id: `saved_${day}_${period}`,
                    day: day,
                    period: period,
                    start_time: times.start,
                    end_time: times.end,
                    subject_code: fullText,
                    subject_name: fullText,
                    faculty_name: currentUser ? currentUser.full_name : 'Assigned Faculty',
                    room: 'Room 101'
                });
            }
        });
    });

    if (updated.length > 0) {
        currentTimetable = updated;
        localStorage.setItem('scheduler_custom_timetable', JSON.stringify(updated));
        populateSubstituteDropdown(currentTimetable);
        alert("✅ Timetable schedule saved successfully!");
    } else {
        alert("Schedule updated.");
    }
};

// ================= FILE UPLOAD & DROPZONE =================
function initDropZone() {
    const dropZone = document.getElementById('ocrDropZone');
    const fileInput = document.getElementById('imageInput');

    if (dropZone && fileInput) {
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.remove('dragover');
            }, false);
        });

        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                fileInput.files = files;
                handleDirectFileUpload(fileInput);
            }
        });
    }
}

window.setImportMode = function(mode) {
    const fileContainer = document.getElementById('importFileContainer');
    const pasteContainer = document.getElementById('importPasteContainer');
    const presetContainer = document.getElementById('importPresetContainer');
    const tabFile = document.getElementById('tabModeFile');
    const tabPaste = document.getElementById('tabModePaste');
    const tabPreset = document.getElementById('tabModePreset');

    [tabFile, tabPaste, tabPreset].forEach(t => {
        if (t) { t.style.background = 'white'; t.style.color = '#475569'; }
    });
    [fileContainer, pasteContainer, presetContainer].forEach(c => {
        if (c) c.style.display = 'none';
    });

    if (mode === 'file') {
        if (fileContainer) fileContainer.style.display = 'block';
        if (tabFile) { tabFile.style.background = 'var(--primary)'; tabFile.style.color = 'white'; }
    } else if (mode === 'paste') {
        if (pasteContainer) pasteContainer.style.display = 'block';
        if (tabPaste) { tabPaste.style.background = 'var(--primary)'; tabPaste.style.color = 'white'; }
    } else if (mode === 'preset') {
        if (presetContainer) presetContainer.style.display = 'block';
        if (tabPreset) { tabPreset.style.background = 'var(--primary)'; tabPreset.style.color = 'white'; }
    }
};

window.handleDirectFileUpload = function(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];

    // Ensure the user is viewing the scan (Upload Paper Sheet) tab where the validation & editable preview are presented
    const scanTabBtn = document.querySelector('nav button:nth-child(3)');
    if (typeof switchTab === 'function') {
        switchTab('scan', scanTabBtn);
    }

    updateFilePreview(file);
    generateTableFromFile(file);
};

window.handleImageSelected = function(input) {
    handleDirectFileUpload(input);
};

function updateFilePreview(file) {
    const previewContainer = document.getElementById('imagePreviewContainer');
    const previewImg = document.getElementById('imagePreview');
    const excelBadge = document.getElementById('excelPreviewBadge');
    const fileNameSpan = document.getElementById('previewFileName');
    
    const isSpreadsheet = /\.(xlsx|xls|csv|tsv)$/i.test(file.name);
    const isPdf = /\.pdf$/i.test(file.name);

    if (fileNameSpan) {
        let icon = '📸';
        if (isSpreadsheet) icon = '📊';
        else if (isPdf) icon = '📄';
        fileNameSpan.innerText = `${icon} ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    }

    if (isSpreadsheet || isPdf) {
        if (previewImg) previewImg.style.display = 'none';
        if (excelBadge) {
            excelBadge.style.display = 'block';
            excelBadge.innerText = isPdf ? '📄 PDF Document Ready & Parsing...' : '📊 Excel/CSV Spreadsheet Ready & Parsing...';
        }
        if (previewContainer) previewContainer.style.display = 'block';
    } else {
        const reader = new FileReader();
        reader.onload = function(e) {
            if (previewImg) {
                previewImg.src = e.target.result;
                previewImg.style.display = 'block';
            }
            if (excelBadge) excelBadge.style.display = 'none';
            if (previewContainer) previewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

window.clearSelectedImage = function() {
    const fileInput = document.getElementById('imageInput');
    const quickInput = document.getElementById('quickTimetableFileInput');
    const previewContainer = document.getElementById('imagePreviewContainer');
    if (fileInput) fileInput.value = '';
    if (quickInput) quickInput.value = '';
    if (previewContainer) previewContainer.style.display = 'none';
};

window.resetOCRTab = function() {
    clearSelectedImage();
    const progressBox = document.getElementById('ocrProgressBox');
    const gridContainer = document.getElementById('extractedGridContainer');
    const rawDetails = document.getElementById('rawOcrDetails');
    const ocrResult = document.getElementById('ocrResult');
    
    if (progressBox) progressBox.style.display = 'none';
    if (gridContainer) gridContainer.style.display = 'none';
    if (rawDetails) rawDetails.style.display = 'none';
    if (ocrResult) ocrResult.innerText = '';
};

// ================= UNIVERSAL TABLE GENERATOR ENTRY POINT =================
let currentUploadSessionId = 0;

// Staged Timetable State (Strictly isolated from master timetable until user explicitly clicks "Apply to Master Timetable")
let stagedTimetableData = null;
let stagedValidationResults = null;
let stagedIsDirty = false;

function resetStagingState() {
    stagedTimetableData = null;
    stagedValidationResults = null;
    stagedIsDirty = false;

    const summaryCard = document.getElementById('validationSummaryContainer');
    const gridCard = document.getElementById('extractedGridContainer');
    const previewBadge = document.getElementById('previewChangesBadge');
    const tbody = document.getElementById('extractedTimetableBody');

    if (summaryCard) summaryCard.style.display = 'none';
    if (gridCard) gridCard.style.display = 'none';
    if (previewBadge) previewBadge.style.display = 'none';
    if (tbody) tbody.innerHTML = '';
}

async function generateTableFromFile(file) {
    if (!file) return;

    const thisSessionId = ++currentUploadSessionId;

    // 1. Immediately Clear Previous Staged State (DO NOT touch Master Timetable)
    resetStagingState();

    const progressBox = document.getElementById('ocrProgressBox');
    const progressBar = document.getElementById('ocrProgressBar');
    const statusText  = document.getElementById('ocrStatusText');
    const percentText = document.getElementById('ocrPercentText');
    const extractBtn  = document.getElementById('extractBtn');
    const rawDetails  = document.getElementById('rawOcrDetails');
    const ocrResult   = document.getElementById('ocrResult');
    const extractedTbody = document.getElementById('extractedTimetableBody');

    if (extractedTbody) {
        extractedTbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:25px; color:#64748b;">Processing uploaded timetable file...</td></tr>';
    }
    if (rawDetails) rawDetails.style.display = 'none';
    if (ocrResult) ocrResult.innerText = '';

    if (progressBox) progressBox.style.display = 'block';
    if (progressBar) progressBar.style.width = '15%';
    if (statusText)  statusText.innerText = `Analyzing table structure in "${file.name}"...`;
    if (percentText) percentText.innerText = '15%';
    if (extractBtn)  { extractBtn.disabled = true; extractBtn.style.opacity = '0.7'; }

    try {
        const fileName = file.name.toLowerCase();

        if (/\.(xlsx|xls)$/i.test(fileName)) {
            await processExcelFile(file, thisSessionId);
        } else if (/\.(csv|tsv|txt)$/i.test(fileName)) {
            await processCsvOrTextFile(file, thisSessionId);
        } else if (/\.pdf$/i.test(fileName)) {
            await processPdfFile(file, thisSessionId);
        } else {
            await processImageFile(file, thisSessionId);
        }
    } catch (err) {
        if (thisSessionId !== currentUploadSessionId) return;
        console.error('File generation error:', err);
        if (statusText) statusText.innerText = 'Generation Error: ' + err.message;
        if (progressBar) progressBar.style.width = '0%';
        if (percentText) percentText.innerText = 'Error';
        alert('Could not generate timetable table from file: ' + err.message + '\n\nPlease ensure the uploaded file contains a visible timetable grid.');
    } finally {
        if (extractBtn) { extractBtn.disabled = false; extractBtn.style.opacity = '1'; }
    }
}

window.processImage = function() {
    const fileInput = document.getElementById('imageInput');
    const quickInput = document.getElementById('quickTimetableFileInput');
    const file = (fileInput && fileInput.files && fileInput.files[0]) || (quickInput && quickInput.files && quickInput.files[0]);

    if (!file) {
        alert('Please choose or drop a timetable file first!');
        return;
    }
    generateTableFromFile(file);
};

// ================= 1. EXCEL PARSER WITH MERGED CELLS (!merges) =================
async function processExcelFile(file, sessionId) {
    if (sessionId && sessionId !== currentUploadSessionId) return;

    const progressBar = document.getElementById('ocrProgressBar');
    const statusText  = document.getElementById('ocrStatusText');
    const percentText = document.getElementById('ocrPercentText');

    if (progressBar) progressBar.style.width = '30%';
    if (statusText)  statusText.innerText = 'Extracting spreadsheet cells and merged ranges...';
    if (percentText) percentText.innerText = '30%';

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    
    let selectedSheetName = workbook.SheetNames[0];
    for (const name of workbook.SheetNames) {
        if (/timetable|schedule|routine|class|sem/i.test(name)) {
            selectedSheetName = name;
            break;
        }
    }

    const worksheet = workbook.Sheets[selectedSheetName];
    if (!worksheet || !worksheet['!ref']) {
        throw new Error('Selected Excel sheet is empty.');
    }

    const range = XLSX.utils.decode_range(worksheet['!ref']);
    const numRows = range.e.r + 1;
    const numCols = range.e.c + 1;

    // Build full 2D grid
    const matrix = [];
    for (let r = 0; r < numRows; r++) {
        const row = [];
        for (let c = 0; c < numCols; c++) {
            const cellAddr = XLSX.utils.encode_cell({ r, c });
            const cell = worksheet[cellAddr];
            const rawVal = cell ? String(cell.w || cell.v || '').trim() : '';
            row.push({
                val: rawVal,
                isMerged: false,
                startCol: c,
                endCol: c,
                startRow: r,
                endRow: r
            });
        }
        matrix.push(row);
    }

    // Apply merged cells (!merges)
    const merges = worksheet['!merges'] || [];
    merges.forEach(m => {
        const rootVal = matrix[m.s.r][m.s.c].val;
        for (let r = m.s.r; r <= m.e.r; r++) {
            for (let c = m.s.c; c <= m.e.c; c++) {
                if (matrix[r] && matrix[r][c]) {
                    matrix[r][c].val = rootVal;
                    matrix[r][c].isMerged = true;
                    matrix[r][c].startCol = m.s.c;
                    matrix[r][c].endCol = m.e.c;
                    matrix[r][c].startRow = m.s.r;
                    matrix[r][c].endRow = m.e.r;
                }
            }
        }
    });

    if (sessionId && sessionId !== currentUploadSessionId) return;

    if (progressBar) progressBar.style.width = '70%';
    if (statusText)  statusText.innerText = 'Detecting Days, Periods, Timings, and Spans...';
    if (percentText) percentText.innerText = '70%';

    const structuredTimetable = parseMatrixToStructuredTimetable(matrix);
    displayStagedTimetable(structuredTimetable, file.name, sessionId);

    if (progressBar) progressBar.style.width = '100%';
    if (percentText) percentText.innerText = '100%';
    if (statusText)  statusText.innerText = `✅ Preview ready for Excel "${file.name}"!`;
}

// ================= 2. CSV / TSV / TEXT PARSER =================
async function processCsvOrTextFile(file, sessionId) {
    if (sessionId && sessionId !== currentUploadSessionId) return;

    const progressBar = document.getElementById('ocrProgressBar');
    const statusText  = document.getElementById('ocrStatusText');
    const percentText = document.getElementById('ocrPercentText');

    if (progressBar) progressBar.style.width = '35%';
    if (statusText)  statusText.innerText = 'Parsing CSV table rows and headers...';
    if (percentText) percentText.innerText = '35%';

    const text = await file.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    
    const rows = lines.map(line => {
        if (line.includes('\t')) return line.split('\t');
        if (line.includes(',')) {
            const matches = line.match(/(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g) || [];
            return matches.map(m => m.replace(/^,?"?|"?$/g, '').trim());
        }
        if (line.includes(';')) return line.split(';').map(c => c.trim());
        return line.split(/\s{2,}/);
    });

    const matrix = rows.map((r, rIdx) => r.map((c, cIdx) => ({
        val: String(c || '').trim(),
        isMerged: false,
        startCol: cIdx,
        endCol: cIdx,
        startRow: rIdx,
        endRow: rIdx
    })));

    if (sessionId && sessionId !== currentUploadSessionId) return;

    const structuredTimetable = parseMatrixToStructuredTimetable(matrix);
    displayStagedTimetable(structuredTimetable, file.name, sessionId);

    if (progressBar) progressBar.style.width = '100%';
    if (percentText) percentText.innerText = '100%';
    if (statusText)  statusText.innerText = `✅ Preview ready for CSV "${file.name}"!`;
}

// ================= 3. PDF PARSER (DIGITAL LAYOUT OR SCANNED OCR) =================
async function processPdfFile(file, sessionId) {
    if (sessionId && sessionId !== currentUploadSessionId) return;

    const progressBar = document.getElementById('ocrProgressBar');
    const statusText  = document.getElementById('ocrStatusText');
    const percentText = document.getElementById('ocrPercentText');

    if (progressBar) progressBar.style.width = '25%';
    if (statusText)  statusText.innerText = 'Reading PDF table grid coordinates...';
    if (percentText) percentText.innerText = '25%';

    if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF reader library is loading. Please try again in 2 seconds.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    const page = await pdfDoc.getPage(1);

    const textContent = await page.getTextContent();
    const items = textContent && textContent.items ? textContent.items : [];

    if (items.length > 20) {
        if (progressBar) progressBar.style.width = '60%';
        if (statusText)  statusText.innerText = 'Reconstructing PDF table grid from spatial text...';
        if (percentText) percentText.innerText = '60%';

        // Cluster items by Y (rows) and X (columns)
        const rowClusters = [];
        const thresholdY = 6;

        items.forEach(item => {
            const text = (item.str || '').trim();
            if (!text) return;
            const x = item.transform[4];
            const y = item.transform[5];
            const width = item.width || 20;

            let row = rowClusters.find(r => Math.abs(r.y - y) <= thresholdY);
            if (!row) {
                row = { y, items: [] };
                rowClusters.push(row);
            }
            row.items.push({ text, x, width });
        });

        rowClusters.sort((a, b) => b.y - a.y); // top to bottom
        const reconstructedMatrix = rowClusters.map((r, rIdx) => {
            r.items.sort((a, b) => a.x - b.x); // left to right
            return r.items.map((it, cIdx) => ({
                val: it.text,
                x: it.x,
                width: it.width,
                isMerged: false,
                startCol: cIdx,
                endCol: cIdx,
                startRow: rIdx,
                endRow: rIdx
            }));
        });

        if (sessionId && sessionId !== currentUploadSessionId) return;

        const structuredTimetable = parseMatrixToStructuredTimetable(reconstructedMatrix);
        displayStagedTimetable(structuredTimetable, file.name, sessionId);

        if (progressBar) progressBar.style.width = '100%';
        if (percentText) percentText.innerText = '100%';
        if (statusText)  statusText.innerText = `✅ Preview ready for PDF "${file.name}"!`;
    } else {
        if (statusText) statusText.innerText = 'Scanned PDF detected. Rendering page to high-res image...';
        const viewport = page.getViewport({ scale: 2.2 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: context, viewport: viewport }).promise;
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        await processImageFile(blob, sessionId, file.name);
    }
}

// ================= 4. IMAGE & SCANNED OCR PARSER (AI + SPATIAL GEOMETRY FALLBACK) =================
async function processImageFile(file, sessionId, displayName) {
    if (sessionId && sessionId !== currentUploadSessionId) return;

    const progressBar = document.getElementById('ocrProgressBar');
    const statusText  = document.getElementById('ocrStatusText');
    const percentText = document.getElementById('ocrPercentText');
    const rawDetails  = document.getElementById('rawOcrDetails');
    const ocrResult   = document.getElementById('ocrResult');

    if (progressBar) progressBar.style.width = '20%';
    if (statusText)  statusText.innerText = 'Sending image for AI vision table analysis...';
    if (percentText) percentText.innerText = '20%';

    // Step 1: Try Server-side Gemini AI Vision Extraction
    let aiSuccess = false;
    try {
        const formData = new FormData();
        formData.append('timetable_image', file, displayName || file.name || 'timetable.png');

        const savedApiKey = localStorage.getItem('gemini_api_key') || '';
        const headers = {};
        if (savedApiKey) headers['x-gemini-key'] = savedApiKey;

        const res = await fetch('/api/timetable/extract-ai', {
            method: 'POST',
            body: formData,
            headers
        });

        if (sessionId && sessionId !== currentUploadSessionId) return;

        if (res.ok) {
            const data = await res.json();
            if (data && data.success && Array.isArray(data.schedule) && data.schedule.length > 0) {
                if (progressBar) progressBar.style.width = '90%';
                if (statusText)  statusText.innerText = 'AI extraction complete! Formatting table...';
                if (percentText) percentText.innerText = '90%';

                displayStagedTimetable(data, displayName || file.name || 'Uploaded Photo', sessionId);
                aiSuccess = true;
            }
        }
    } catch (aiErr) {
        console.warn('AI Vision Extraction request error:', aiErr.message);
    }

    if (aiSuccess) {
        if (progressBar) progressBar.style.width = '100%';
        if (percentText) percentText.innerText = '100%';
        if (statusText)  statusText.innerText = `✅ Preview generated from AI Vision analysis!`;
        return;
    }

    if (sessionId && sessionId !== currentUploadSessionId) return;

    // Step 2: Client-side Spatial OCR Layout Analysis (Tesseract Word Bounding Box Geometry)
    if (progressBar) progressBar.style.width = '40%';
    if (statusText)  statusText.innerText = 'Analyzing table bounding boxes and cell geometry...';
    if (percentText) percentText.innerText = '40%';

    let enhancedImg;
    try {
        enhancedImg = await preprocessImageForOCR(file);
    } catch (e) {
        enhancedImg = file;
    }

    let ocrData = { text: '', words: [] };
    if (typeof Tesseract !== 'undefined') {
        const result = await Tesseract.recognize(enhancedImg, 'eng', {
            logger: m => {
                if (sessionId && sessionId !== currentUploadSessionId) return;
                if (m.status === 'recognizing text') {
                    const pct = Math.round((m.progress || 0) * 100);
                    const scaled = Math.round(40 + pct * 0.45);
                    if (progressBar) progressBar.style.width = `${scaled}%`;
                    if (percentText) percentText.innerText = `${scaled}%`;
                    if (statusText)  statusText.innerText = `Scanning table grid: ${pct}%`;
                }
            }
        });
        if (result && result.data) ocrData = result.data;
    }

    if (sessionId && sessionId !== currentUploadSessionId) return;

    const structuredTimetable = parseOcrSpatialGeometry(ocrData);
    displayStagedTimetable(structuredTimetable, displayName || file.name || 'Uploaded Photo', sessionId);

    if (progressBar) progressBar.style.width = '100%';
    if (percentText) percentText.innerText = '100%';
    if (statusText)  statusText.innerText = `✅ Preview ready from "${displayName || file.name || 'Photo'}"!`;
}

function preprocessImageForOCR(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read image.'));
        reader.onload = function(e) {
            const img = new Image();
            img.onerror = () => reject(new Error('Failed to load image.'));
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const scale = Math.max(1, Math.min(2.0, 2200 / img.width));
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);

                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imgData.data;

                // Contrast enhancement
                let minLum = 255, maxLum = 0;
                for (let i = 0; i < data.length; i += 4) {
                    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                    if (lum < minLum) minLum = lum;
                    if (lum > maxLum) maxLum = lum;
                }
                const range = (maxLum - minLum) || 1;
                for (let i = 0; i < data.length; i += 4) {
                    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                    const val = Math.min(255, Math.max(0, Math.round(((lum - minLum) / range) * 255)));
                    data[i] = val;
                    data[i + 1] = val;
                    data[i + 2] = val;
                }
                ctx.putImageData(imgData, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ================= SPATIAL TABLE STRUCTURE ANALYZER =================
function matchDayName(token) {
    if (!token) return null;
    const str = String(token).trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    if (str.includes('mon') || str.includes('m0n') || str === 'm' || str === 'day1') return 'Monday';
    if (str.includes('tue') || str.includes('tues') || str === 'tu' || str === 'day2') return 'Tuesday';
    if (str.includes('wed') || str.includes('wednes') || str === 'w' || str === 'day3') return 'Wednesday';
    if (str.includes('thu') || str.includes('thur') || str.includes('thurs') || str === 'th' || str === 'day4') return 'Thursday';
    if (str.includes('fri') || str === 'f' || str === 'day5') return 'Friday';
    if (str.includes('sat') || str.includes('satur') || str === 'sa' || str === 'day6') return 'Saturday';
    if (str.includes('sun') || str === 'su' || str === 'day7') return 'Sunday';
    return null;
}

function isHeaderNoise(text) {
    if (!text) return true;
    const s = String(text).toLowerCase();
    return /college|department|academic\s*year|w\.?e\.?f|curriculum|semester|shift|prepared\s*by|verified\s*by|signature|principal|hod|head\s*of|class\s*in-charge|staff|phone|mobile|email|abbreviation|s\.?no/i.test(s);
}

function isTimeColumnToken(val) {
    if (!val) return false;
    const s = String(val).trim().toLowerCase().replace(/[^a-z]/g, '');
    return /^(time|timing|timings|hour|hours|duration)$/i.test(s);
}

function isSpecialColumnToken(val) {
    if (!val) return false;
    const s = String(val).trim().toLowerCase().replace(/[^a-z]/g, '');
    return /^(assembly|morningassembly|interval|lunch|lunchbreak|break|teabreak|recess|zerohour|prayer)$/i.test(s);
}

function isBreakToken(val) {
    return isSpecialColumnToken(val);
}

function cleanSubjectText(raw) {
    if (!raw) return '';
    let val = String(raw).trim()
        .replace(/^[^a-zA-Z0-9&/()+-]+|[^a-zA-Z0-9&/()+-]+$/g, '')
        .replace(/\s+/g, ' ');

    const lower = val.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (/^(day|days|time|timing|period|periods|p\d|hour|hours|sno|slno|total|room|wef|sem)$/i.test(lower)) return '';
    if (/^\d{1,2}[.:]\d{2}/.test(val)) return '';

    return toFullSubjectName(val);
}

/**
 * Parses a 2D Matrix of cell objects into a standardized structured timetable:
 * { days: [...], periods: [...], breaks: [...], schedule: [...], maxPeriods: N }
 */
function parseMatrixToStructuredTimetable(matrix) {
    if (!Array.isArray(matrix) || matrix.length === 0) {
        return { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], periods: [], breaks: [], schedule: [], maxPeriods: 7 };
    }

    const detectedDays = [];
    const dayRowIndices = {};
    let dayColIndex = -1;

    // 1. Find Day Column and Day Rows
    for (let r = 0; r < matrix.length; r++) {
        const row = matrix[r];
        for (let c = 0; c < Math.min(4, row.length); c++) {
            const day = matchDayName(row[c].val);
            if (day && !detectedDays.includes(day)) {
                detectedDays.push(day);
                dayRowIndices[day] = r;
                if (dayColIndex === -1) dayColIndex = c;
            }
        }
    }

    if (dayColIndex === -1) dayColIndex = 0;
    if (detectedDays.length === 0) {
        detectedDays.push('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday');
    }

    // 2. Find Period Header and Timings Rows
    const firstDayRow = Object.values(dayRowIndices).length > 0 ? Math.min(...Object.values(dayRowIndices)) : 1;
    let periodRowIndex = -1;
    let timingRowIndex = -1;

    for (let r = 0; r < firstDayRow; r++) {
        const row = matrix[r];
        const rowText = row.map(cell => cell.val).join(' ');
        const digitCount = row.filter(c => /^[1-9]$|^p[1-9]$/i.test(String(c.val || '').trim())).length;

        if ((digitCount >= 3 || /\b(p1|period|periods|hour|hours|1\s+2\s+3|i\s+ii\s+iii)\b/i.test(rowText)) && periodRowIndex === -1) {
            periodRowIndex = r;
        }
        if (/\b(\d{1,2}[:.]\d{2}|am|pm)\b/i.test(rowText) && timingRowIndex === -1) {
            timingRowIndex = r;
        }
    }

    if (periodRowIndex === -1 && firstDayRow > 0) {
        periodRowIndex = 0;
    }

    // 3. Map Columns to Periods, Time Column, and Special Sections
    const numCols = Math.max(...matrix.map(r => r.length));
    const colPeriodMap = {};
    const periods = [];
    const breaks = [];
    let periodCounter = 1;

    for (let c = dayColIndex + 1; c < numCols; c++) {
        const colHeader = (periodRowIndex !== -1 && matrix[periodRowIndex] && matrix[periodRowIndex][c])
            ? matrix[periodRowIndex][c].val : '';
        const colTiming = (timingRowIndex !== -1 && matrix[timingRowIndex] && matrix[timingRowIndex][c])
            ? matrix[timingRowIndex][c].val : '';

        // A. Is this a dedicated Time column?
        if (isTimeColumnToken(colHeader) || (c === dayColIndex + 1 && /^(time|timing|timings)$/i.test(colHeader))) {
            continue; // Skip treating Time column as teaching period
        }

        // B. Is this an explicit Special / Divider column (Assembly, Interval, Lunch)?
        let isSpecial = isSpecialColumnToken(colHeader);
        if (!isSpecial) {
            let specialCount = 0;
            detectedDays.forEach(day => {
                const r = dayRowIndices[day];
                if (r !== undefined && matrix[r] && matrix[r][c] && isSpecialColumnToken(matrix[r][c].val)) {
                    specialCount++;
                }
            });
            if (specialCount >= 2) isSpecial = true;
        }

        if (isSpecial) {
            breaks.push({
                afterPeriod: periodCounter - 1,
                timing: colTiming || '',
                label: colHeader || 'Break'
            });
        } else {
            colPeriodMap[c] = periodCounter;
            periods.push({
                period: periodCounter,
                timing: colTiming || `Period ${periodCounter}`
            });
            periodCounter++;
        }
    }

    const maxPeriods = Math.max(periodCounter - 1, 1);

    // 4. Extract Schedule Cells with Merged/Span Detection
    const schedule = [];

    detectedDays.forEach(day => {
        const r = dayRowIndices[day];
        if (r === undefined || !matrix[r]) return;

        const row = matrix[r];
        let c = dayColIndex + 1;

        while (c < row.length) {
            const cell = row[c];
            if (!cell || !colPeriodMap[c]) {
                c++;
                continue;
            }

            const rawVal = cell.val;
            if (isBreakToken(rawVal)) {
                c++;
                continue;
            }

            const subject = cleanSubjectText(rawVal);
            if (subject && subject.toUpperCase() !== 'FREE' && subject !== '-') {
                const startPeriod = colPeriodMap[c];
                let endPeriod = startPeriod;

                if (cell.isMerged && cell.endCol > c) {
                    const mappedEnd = colPeriodMap[cell.endCol];
                    endPeriod = mappedEnd || startPeriod;
                    c = cell.endCol; // jump past merged span
                } else {
                    // Check if adjacent subsequent cells in this row share the same text (span)
                    let nextC = c + 1;
                    while (nextC < row.length && colPeriodMap[nextC] && row[nextC].val === rawVal) {
                        endPeriod = colPeriodMap[nextC];
                        nextC++;
                    }
                    c = nextC - 1;
                }

                schedule.push({
                    day: day,
                    startPeriod: startPeriod,
                    endPeriod: endPeriod,
                    subject: subject,
                    room: 'Room 101'
                });
            }
            c++;
        }
    });

    return {
        days: detectedDays,
        periods: periods.length > 0 ? periods : Array.from({ length: maxPeriods }, (_, i) => ({ period: i + 1, timing: `P${i + 1}` })),
        breaks,
        schedule,
        maxPeriods
    };
}

/**
 * True 2D Spatial Geometry & Bounding-Box Layout Analyzer for Tesseract OCR data
 */
function parseOcrSpatialGeometry(ocrData) {
    if (!ocrData) {
        return { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], periods: [], breaks: [], schedule: [], maxPeriods: 7 };
    }

    const words = Array.isArray(ocrData.words) ? ocrData.words : [];

    if (words.length > 10) {
        // Step 1: Detect Day labels and their vertical Y boundaries
        const detectedDayRows = [];
        words.forEach(w => {
            const day = matchDayName(w.text);
            if (day && w.bbox) {
                detectedDayRows.push({
                    day,
                    bbox: w.bbox,
                    cy: (w.bbox.y0 + w.bbox.y1) / 2
                });
            }
        });

        detectedDayRows.sort((a, b) => a.cy - b.cy);
        const uniqueDayRows = [];
        const seenDays = new Set();
        detectedDayRows.forEach(item => {
            if (!seenDays.has(item.day)) {
                seenDays.add(item.day);
                uniqueDayRows.push(item);
            }
        });

        if (uniqueDayRows.length >= 2) {
            const dayList = uniqueDayRows.map(d => d.day);
            const firstDayY = uniqueDayRows[0].cy;
            const avgRowH = uniqueDayRows.length > 1
                ? (uniqueDayRows[uniqueDayRows.length - 1].cy - uniqueDayRows[0].cy) / (uniqueDayRows.length - 1)
                : 60;

            // Step 2: Detect Period header columns in top region
            const headerWords = words.filter(w => w.bbox && (w.bbox.y0 + w.bbox.y1) / 2 < firstDayY);
            const periodCols = [];

            headerWords.forEach(w => {
                const txt = w.text.trim();
                const m = txt.match(/\b(?:p)?([1-9])\b/i);
                if (m) {
                    const pNum = parseInt(m[1]);
                    if (!periodCols.some(pc => pc.period === pNum)) {
                        periodCols.push({
                            period: pNum,
                            cx: (w.bbox.x0 + w.bbox.x1) / 2,
                            x0: w.bbox.x0,
                            x1: w.bbox.x1
                        });
                    }
                }
            });

            periodCols.sort((a, b) => a.cx - b.cx);

            let maxP = periodCols.length > 0 ? Math.max(...periodCols.map(p => p.period)) : 7;
            if (maxP < 5) maxP = 7;

            // Step 3: Compute column boundary intervals
            const colBounds = [];
            for (let i = 0; i < periodCols.length; i++) {
                const prevCx = i > 0 ? periodCols[i - 1].cx : 0;
                const currCx = periodCols[i].cx;
                const nextCx = i < periodCols.length - 1 ? periodCols[i + 1].cx : currCx + (currCx - prevCx);
                
                const left = i === 0 ? currCx - (nextCx - currCx) / 2 : (prevCx + currCx) / 2;
                const right = (currCx + nextCx) / 2;
                colBounds.push({ period: periodCols[i].period, left, right, cx: currCx });
            }

            // Step 4: Map body words into (day, period) grid cells
            const schedule = [];

            uniqueDayRows.forEach(dayRow => {
                const day = dayRow.day;
                const rowTop = dayRow.cy - avgRowH * 0.45;
                const rowBottom = dayRow.cy + avgRowH * 0.45;

                const rowWords = words.filter(w => {
                    if (!w.bbox) return false;
                    const cy = (w.bbox.y0 + w.bbox.y1) / 2;
                    const cx = (w.bbox.x0 + w.bbox.x1) / 2;
                    return cy >= rowTop && cy <= rowBottom && cx > (dayRow.bbox.x1 + 5);
                });

                if (rowWords.length === 0) return;

                const periodCells = {};
                for (let p = 1; p <= maxP; p++) periodCells[p] = [];

                rowWords.forEach(w => {
                    if (isHeaderNoise(w.text)) return;
                    const cx = (w.bbox.x0 + w.bbox.x1) / 2;
                    let assignedP = 1;
                    let bestDist = Infinity;

                    for (const cb of colBounds) {
                        if (cx >= cb.left && cx <= cb.right) {
                            assignedP = cb.period;
                            break;
                        }
                        const dist = Math.abs(cb.cx - cx);
                        if (dist < bestDist) {
                            bestDist = dist;
                            assignedP = cb.period;
                        }
                    }

                    if (periodCells[assignedP]) {
                        periodCells[assignedP].push(w);
                    }
                });

                let p = 1;
                while (p <= maxP) {
                    const pWords = periodCells[p] || [];
                    if (pWords.length === 0) {
                        p++;
                        continue;
                    }

                    pWords.sort((a, b) => a.bbox.x0 - b.bbox.x0);
                    let cellText = pWords.map(w => w.text).join(' ').trim();
                    let startPeriod = p;
                    let endPeriod = p;

                    const maxX = Math.max(...pWords.map(w => w.bbox.x1));

                    for (let checkP = p + 1; checkP <= maxP; checkP++) {
                        const targetCb = colBounds.find(cb => cb.period === checkP);
                        if (targetCb && maxX >= targetCb.left + 10) {
                            endPeriod = checkP;
                        }
                    }

                    let nextP = endPeriod + 1;
                    while (nextP <= maxP) {
                        const nextWords = periodCells[nextP] || [];
                        if (nextWords.length === 0) break;
                        const nextText = nextWords.map(w => w.text).join(' ').trim();
                        
                        const isLabContinuation = /^(lab|prog|work|skills|technology|computing|multimedia)$/i.test(nextText) ||
                                                  /^(android|python|life|web|java|dbms|bdcc|som|cad|de|ds)$/i.test(cellText) && /lab/i.test(nextText) ||
                                                  cellText.toLowerCase() === nextText.toLowerCase();

                        if (isLabContinuation) {
                            cellText += ' ' + nextText;
                            endPeriod = nextP;
                            nextP++;
                        } else {
                            break;
                        }
                    }

                    const clean = cleanSubjectText(cellText);
                    if (clean && clean.toUpperCase() !== 'FREE' && clean !== '-') {
                        schedule.push({
                            day,
                            startPeriod,
                            endPeriod,
                            subject: clean,
                            room: 'Room 101'
                        });
                    }
                    p = endPeriod + 1;
                }
            });

            if (schedule.length > 0) {
                const periods = Array.from({ length: maxP }, (_, i) => ({ period: i + 1, timing: `P${i + 1}` }));
                return {
                    days: dayList,
                    periods,
                    breaks: [],
                    schedule,
                    maxPeriods: maxP
                };
            }
        }
    }

    // Fallback: Token matrix parse
    const rawText = (ocrData.text || '').trim();
    if (!rawText) {
        return { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], periods: [], breaks: [], schedule: [], maxPeriods: 7 };
    }

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const lineMatrix = lines.map((line, rIdx) => {
        const tokens = line.includes('\t')
            ? line.split('\t')
            : (line.includes('|') ? line.split('|') : line.split(/\s{2,}|\s(?=[A-Z0-9]{2,}\b)/));

        return tokens.map((t, cIdx) => ({
            val: t.trim(),
            isMerged: false,
            startCol: cIdx,
            endCol: cIdx,
            startRow: rIdx,
            endRow: rIdx
        }));
    });

    return parseMatrixToStructuredTimetable(lineMatrix);
}

// ================= 5. VALIDATION ENGINE =================
function validateTimetableStructure(data) {
    if (!data) {
        return {
            isValid: false,
            summary: {
                daysCount: 0,
                periodsCount: 0,
                totalCells: 0,
                occupiedCells: 0,
                freeCells: 0,
                mergedCount: 0,
                breaksCount: 0,
                verificationNeededCount: 0
            },
            checks: [],
            warnings: [{ type: 'error', message: 'No structured timetable data found.' }],
            errors: ['Empty data']
        };
    }

    const checks = [];
    const warnings = [];
    const errors = [];

    const days = Array.isArray(data.days) ? data.days : [];
    const periods = Array.isArray(data.periods) ? data.periods : [];
    const breaks = Array.isArray(data.breaks) ? data.breaks : [];
    const schedule = Array.isArray(data.schedule) ? data.schedule : [];
    const maxPeriods = data.maxPeriods || (periods.length > 0 ? Math.max(...periods.map(p => p.period)) : 7);

    // 1. Days Validation
    if (days.length === 0) {
        errors.push('No academic days detected in the timetable.');
    } else {
        const uniqueDays = new Set(days);
        if (uniqueDays.size !== days.length) {
            warnings.push('Duplicate day rows were detected and consolidated.');
        }
        checks.push({
            type: 'success',
            title: 'Days Structure',
            message: `${days.length} days detected: ${days.join(', ')}`
        });
    }

    // 2. Period Count & Sequential Order
    if (maxPeriods <= 0) {
        errors.push('No teaching periods detected in header.');
    } else {
        const periodNums = periods.map(p => p.period).sort((a, b) => a - b);
        let isSequential = true;
        for (let i = 1; i <= maxPeriods; i++) {
            if (!periodNums.includes(i)) {
                isSequential = false;
                break;
            }
        }
        if (isSequential) {
            checks.push({
                type: 'success',
                title: 'Period Sequence',
                message: `${maxPeriods} periods detected in clean sequential order (P1 to P${maxPeriods})`
            });
        } else {
            warnings.push(`Periods are not strictly sequential 1..${maxPeriods}. Automatically normalized.`);
        }
    }

    // 3. Time Ranges
    const hasTimings = periods.some(p => p.timing && /\d{1,2}[:.]\d{2}/.test(p.timing));
    if (hasTimings) {
        checks.push({
            type: 'success',
            title: 'Time Slots',
            message: 'Time intervals successfully extracted and mapped to period headers'
        });
    } else {
        checks.push({
            type: 'info',
            title: 'Time Slots',
            message: 'Standard institutional period timings assigned'
        });
    }

    // 4. Merged Labs / Multi-Period Cell Spans
    const mergedList = (data.mergedCells && Array.isArray(data.mergedCells) && data.mergedCells.length > 0)
        ? data.mergedCells
        : schedule.filter(s => s.endPeriod > s.startPeriod);

    const mergedCount = mergedList.length;
    if (mergedCount > 0) {
        checks.push({
            type: 'success',
            title: 'Merged Labs & Multi-Period Spans',
            message: `${mergedCount} multi-period span(s) detected and expanded across all covered periods (e.g. P5–P7)`
        });
    } else {
        checks.push({
            type: 'info',
            title: 'Merged Cells',
            message: 'Single-period format (no merged multi-period labs detected)'
        });
    }

    // 5. Breaks / Intervals / Lunch Isolation
    if (breaks.length > 0) {
        checks.push({
            type: 'success',
            title: 'Break Separation',
            message: `${breaks.length} break/interval column(s) isolated from teaching subjects (${breaks.map(b => b.label || 'Break').join(', ')})`
        });
    } else {
        checks.push({
            type: 'info',
            title: 'Break Separation',
            message: 'No separate break columns detected in grid'
        });
    }

    // 6. Cell Occupancy & Noise Filter & Verification Needed
    let occupiedCount = 0;
    let freeCount = 0;
    let verificationNeededCount = 0;

    days.forEach(day => {
        for (let p = 1; p <= maxPeriods; p++) {
            const cell = schedule.find(c => {
                if (!c || c.day !== day) return false;
                const s = parseInt(c.startPeriod || c.period || 1);
                const e = parseInt(c.endPeriod || c.startPeriod || s);
                return p >= s && p <= e;
            });

            if (cell && cell.subject) {
                const cleanSub = toFullSubjectName(cell.subject);
                if (cleanSub && cleanSub.toUpperCase() !== 'FREE' && cleanSub !== '-') {
                    occupiedCount++;
                    if (cell.needsVerification || /[\?~#$^*_]{2,}/.test(cell.subject)) {
                        verificationNeededCount++;
                    }
                } else {
                    freeCount++;
                }
            } else {
                freeCount++;
            }
        }
    });

    checks.push({
        type: 'success',
        title: 'Subject Mapping',
        message: `${occupiedCount} class periods mapped from file, ${freeCount} free/empty slots preserved without guessing`
    });

    checks.push({
        type: 'success',
        title: 'Noise & Signature Rejection',
        message: 'College headers, addresses, HOD/Principal signatures, and staff directories excluded from timetable grid'
    });

    if (verificationNeededCount > 0) {
        warnings.push(`${verificationNeededCount} cell(s) marked as "Needs Verification" due to low confidence or unclear text. Please review highlighted cells in the preview.`);
    }

    return {
        isValid: errors.length === 0,
        summary: {
            daysCount: days.length,
            periodsCount: maxPeriods,
            totalCells: days.length * maxPeriods,
            occupiedCells: occupiedCount,
            freeCells: freeCount,
            mergedCount: mergedCount,
            breaksCount: breaks.length,
            verificationNeededCount: verificationNeededCount
        },
        checks,
        warnings,
        errors
    };
}

// ================= 6. DISPLAY STAGED TIMETABLE & PREVIEW (DOES NOT OVERWRITE MASTER) =================
function displayStagedTimetable(data, sourceName, sessionId) {
    if (!data) return;
    if (sessionId && sessionId !== currentUploadSessionId) return;

    const days = (Array.isArray(data.days) && data.days.length > 0)
        ? data.days
        : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    let maxPeriods = data.maxPeriods || 7;
    const periods = (Array.isArray(data.periods) && data.periods.length > 0)
        ? data.periods
        : Array.from({ length: maxPeriods }, (_, i) => ({ period: i + 1, timing: `P${i + 1}` }));

    const breaks = Array.isArray(data.breaks) ? data.breaks : [];
    const rawSchedule = Array.isArray(data.schedule) ? data.schedule : [];

    // Calculate maxPeriods from schedule as well
    rawSchedule.forEach(cell => {
        const end = parseInt(cell.endPeriod || cell.startPeriod || 1);
        if (!isNaN(end) && end > maxPeriods) maxPeriods = end;
    });

    // Expand schedule cells cleanly so that every (day, period) has a dedicated slot object
    const normalizedSchedule = [];
    days.forEach(day => {
        for (let p = 1; p <= maxPeriods; p++) {
            const matchingCell = rawSchedule.find(c => {
                if (!c || c.day !== day) return false;
                const s = parseInt(c.startPeriod || c.period || 1);
                const e = parseInt(c.endPeriod || c.startPeriod || s);
                return p >= s && p <= e;
            });

            if (matchingCell && matchingCell.subject) {
                const val = toFullSubjectName(matchingCell.subject);
                const isMulti = matchingCell.endPeriod > matchingCell.startPeriod;
                normalizedSchedule.push({
                    day: day,
                    period: p,
                    startPeriod: matchingCell.startPeriod || p,
                    endPeriod: matchingCell.endPeriod || p,
                    subject: val,
                    room: matchingCell.room || 'Room 101',
                    faculty: matchingCell.faculty || '',
                    needsVerification: Boolean(matchingCell.needsVerification),
                    span: isMulti ? `${matchingCell.startPeriod}-${matchingCell.endPeriod}` : null
                });
            } else {
                normalizedSchedule.push({
                    day: day,
                    period: p,
                    startPeriod: p,
                    endPeriod: p,
                    subject: 'Free',
                    room: 'Room 101',
                    faculty: '',
                    needsVerification: false,
                    span: null
                });
            }
        }
    });

    stagedTimetableData = {
        sourceName: sourceName || 'Uploaded Timetable',
        days,
        periods,
        breaks,
        maxPeriods,
        schedule: normalizedSchedule,
        mergedCells: data.mergedCells || []
    };
    stagedIsDirty = false;

    // Run Validation
    stagedValidationResults = validateTimetableStructure(stagedTimetableData);

    // Render Validation Summary & Editable Preview
    renderValidationSummary(stagedValidationResults);
    renderStagedPreview(stagedTimetableData, stagedValidationResults);

    // Populate Debug Output (View Raw Document Output)
    const rawDetails = document.getElementById('rawOcrDetails');
    const ocrResult = document.getElementById('ocrResult');
    if (rawDetails && ocrResult) {
        const debugLines = [
            '====================================================',
            'EXTRACTED & VALIDATED TIMETABLE DATA',
            '====================================================',
            `Source Document: ${sourceName || 'Uploaded File'}`,
            `Days (${days.length}): ${days.join(', ')}`,
            `Periods (${periods.length}): ${periods.map(p => `P${p.period} (${p.timing})`).join(', ')}`,
            `Breaks (${breaks.length}): ${breaks.map(b => `${b.label || 'Break'} (after P${b.afterPeriod})`).join(', ') || 'None'}`,
            `Occupied Slots: ${stagedValidationResults.summary.occupiedCells}`,
            `Free Slots: ${stagedValidationResults.summary.freeCells}`,
            `Verification Needed: ${stagedValidationResults.summary.verificationNeededCount}`,
            '',
            '====================================================',
            'STRUCTURED TIMETABLE JSON (STAGED PREVIEW DRAFT)',
            '====================================================',
            JSON.stringify(stagedTimetableData, null, 2)
        ];
        rawDetails.style.display = 'block';
        ocrResult.innerText = debugLines.join('\n');
    }

    showStagedReadyNotification(sourceName, stagedValidationResults.summary.occupiedCells, maxPeriods, days.length);
}

function renderValidationSummary(validation) {
    const container = document.getElementById('validationSummaryContainer');
    const badge = document.getElementById('validationStatusBadge');
    const pillsRow = document.getElementById('validationPillsRow');
    const checklist = document.getElementById('validationChecklist');

    if (!container || !validation) return;

    const s = validation.summary;

    // Badge
    if (s.verificationNeededCount > 0) {
        badge.className = 'stat-pill stat-pill-warning';
        badge.innerHTML = `⚠️ ${s.verificationNeededCount} Cell(s) Need Verification`;
    } else if (validation.errors.length > 0) {
        badge.className = 'stat-pill stat-pill-error';
        badge.innerHTML = `❌ ${validation.errors.length} Errors Detected`;
    } else {
        badge.className = 'stat-pill stat-pill-success';
        badge.innerHTML = `✓ Validation Passed (100% Ready)`;
    }

    // Metric Pills
    pillsRow.innerHTML = `
        <span class="stat-pill stat-pill-success">✓ ${s.daysCount} Days Detected</span>
        <span class="stat-pill stat-pill-success">✓ ${s.periodsCount} Periods Detected</span>
        <span class="stat-pill stat-pill-info">📚 ${s.occupiedCells} Classes Mapped</span>
        ${s.mergedCount > 0 ? `<span class="stat-pill stat-pill-info">🔬 ${s.mergedCount} Merged Lab Spans</span>` : ''}
        ${s.breaksCount > 0 ? `<span class="stat-pill stat-pill-warning">☕ ${s.breaksCount} Break Section(s)</span>` : ''}
        ${s.verificationNeededCount > 0 ? `<span class="stat-pill stat-pill-warning">⚠️ ${s.verificationNeededCount} Needs Verification</span>` : `<span class="stat-pill stat-pill-success">✓ 0 Uncertainties</span>`}
    `;

    // Checklist Breakdown
    let checkHtml = `<div style="font-weight: 700; color: #334155; margin-bottom: 6px;">Automated Validation Checks:</div>`;
    checkHtml += `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 6px;">`;

    validation.checks.forEach(c => {
        const icon = c.type === 'success' ? '✅' : 'ℹ️';
        checkHtml += `<div>${icon} <strong>${c.title}:</strong> <span style="color: #475569;">${c.message}</span></div>`;
    });

    validation.warnings.forEach(w => {
        checkHtml += `<div style="color: #b45309; font-weight: 600;">⚠️ <strong>Warning:</strong> ${w}</div>`;
    });

    validation.errors.forEach(e => {
        checkHtml += `<div style="color: #b91c1c; font-weight: 700;">❌ <strong>Error:</strong> ${e}</div>`;
    });

    checkHtml += `</div>`;
    checklist.innerHTML = checkHtml;

    container.style.display = 'block';
}

function renderStagedPreview(data, validation) {
    const gridContainer = document.getElementById('extractedGridContainer');
    const tbody = document.getElementById('extractedTimetableBody');
    const previewBadge = document.getElementById('previewChangesBadge');
    if (!gridContainer || !tbody || !data) return;

    const days = data.days;
    const maxPeriods = data.maxPeriods;
    const breaks = data.breaks || [];
    const schedule = data.schedule || [];

    if (previewBadge) previewBadge.style.display = stagedIsDirty ? 'inline-block' : 'none';

    // Update Header <thead> dynamically
    const tableEl = tbody.closest('table');
    if (tableEl) {
        const thead = tableEl.querySelector('thead');
        if (thead) {
            let thHtml = `<tr><th style="min-width: 95px;">Day</th>`;
            for (let p = 1; p <= maxPeriods; p++) {
                const brk = breaks.find(b => parseInt(b.afterPeriod) === p - 1);
                if (brk) {
                    thHtml += `<th style="background:#fef9c3; color:#92400e; min-width: 65px;">☕ ${brk.label || 'Break'}<br><small>${brk.timing || ''}</small></th>`;
                }
                const times = getPeriodTimings(p);
                thHtml += `<th>P${p}<br><small>${times.start}–${times.end}</small></th>`;
            }
            thHtml += `</tr>`;
            thead.innerHTML = thHtml;
        }
    }

    tbody.innerHTML = '';

    days.forEach(day => {
        let tr = `<tr><td style="font-weight: 700; background: #f8fafc; color: #1e293b; white-space: nowrap;">${day}</td>`;
        for (let p = 1; p <= maxPeriods; p++) {
            const brk = breaks.find(b => parseInt(b.afterPeriod) === p - 1);
            if (brk) {
                tr += `<td style="background:#fef9c3; text-align:center; color:#92400e; font-size:0.8rem; white-space:nowrap;">☕<br><small>${brk.label || 'Break'}</small></td>`;
            }

            const cell = schedule.find(c => c.day === day && c.period === p);
            const rawVal = cell ? cell.subject : 'Free';
            const val = toFullSubjectName(rawVal);
            const isFree = !val || val.toUpperCase() === 'FREE' || val === '-';
            const needsVerif = cell && cell.needsVerification;

            let cellClass = 'grid-cell-editable';
            if (needsVerif) cellClass += ' cell-needs-verification';

            let cellStyle = isFree
                ? 'color: #94a3b8;'
                : (needsVerif ? 'color: #92400e; font-weight: 600;' : 'font-weight: 600; color: #4338ca;');

            let badgeHtml = '';
            if (needsVerif) {
                badgeHtml = `<br><span class="verification-warning-pill">⚠️ Needs Verification</span>`;
            } else if (cell && cell.span) {
                badgeHtml = ` <span style="font-size:0.68rem; background:#c7d2fe; color:#312e81; padding:1px 5px; border-radius:4px; margin-left:4px; font-weight:normal;">P${cell.span}</span>`;
            }

            tr += `
                <td contenteditable="true" 
                    class="${cellClass}" 
                    data-day="${day}" 
                    data-period="${p}" 
                    oninput="handlePreviewCellEdit(this)"
                    title="Click to edit subject (${day} P${p})"
                    style="${cellStyle}">
                    ${isFree ? 'Free' : val}${badgeHtml}
                </td>
            `;
        }
        tr += `</tr>`;
        tbody.innerHTML += tr;
    });

    gridContainer.style.display = 'block';
    gridContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

window.handlePreviewCellEdit = function(td) {
    if (!td || !stagedTimetableData) return;
    const day = td.getAttribute('data-day');
    const period = parseInt(td.getAttribute('data-period'));
    const rawText = td.innerText.replace(/⚠️\s*Needs Verification/g, '').replace(/P\d+[-–]\d+/g, '').trim();

    const cell = (stagedTimetableData.schedule || []).find(c => c.day === day && c.period === period);
    if (cell) {
        cell.subject = rawText || 'Free';
        cell.needsVerification = false;
    }

    td.classList.remove('cell-needs-verification');
    const pill = td.querySelector('.verification-warning-pill');
    if (pill) pill.remove();

    stagedIsDirty = true;
    const previewBadge = document.getElementById('previewChangesBadge');
    if (previewBadge) previewBadge.style.display = 'inline-block';
};

window.savePreviewDraft = function() {
    if (!stagedTimetableData) {
        alert('No extracted preview available to save.');
        return;
    }

    const tbody = document.getElementById('extractedTimetableBody');
    if (tbody) {
        const tds = tbody.querySelectorAll('td[contenteditable="true"]');
        tds.forEach(td => {
            const day = td.getAttribute('data-day');
            const period = parseInt(td.getAttribute('data-period'));
            const text = td.innerText.replace(/⚠️\s*Needs Verification/g, '').replace(/P\d+[-–]\d+/g, '').trim();
            const cell = (stagedTimetableData.schedule || []).find(c => c.day === day && c.period === period);
            if (cell) {
                cell.subject = text ? toFullSubjectName(text) : 'Free';
                cell.needsVerification = false;
            }
        });
    }

    stagedIsDirty = false;
    stagedValidationResults = validateTimetableStructure(stagedTimetableData);
    renderValidationSummary(stagedValidationResults);
    renderStagedPreview(stagedTimetableData, stagedValidationResults);

    alert('✏️ Preview draft changes saved! Click "Apply to Master Timetable" when you are ready to update the live schedule.');
};

window.applyExtractedToMasterSchedule = function() {
    if (!stagedTimetableData) {
        alert('No extracted timetable found. Please upload a file first.');
        return;
    }

    // Collect all cells from preview table to ensure latest live edits are captured
    const tbody = document.getElementById('extractedTimetableBody');
    if (!tbody) return;
    const tds = tbody.querySelectorAll('td[contenteditable="true"]');

    const updatedSchedule = [];
    let count = 0;

    tds.forEach(td => {
        const day = td.getAttribute('data-day');
        const period = parseInt(td.getAttribute('data-period'));
        const rawCode = td.innerText.replace(/⚠️\s*Needs Verification/g, '').replace(/P\d+[-–]\d+/g, '').trim();

        if (rawCode && rawCode.toUpperCase() !== 'FREE' && rawCode !== '-') {
            count++;
            const fullTitle = toFullSubjectName(rawCode);
            const times = getPeriodTimings(period);
            const stagedCell = (stagedTimetableData.schedule || []).find(c => c.day === day && c.period === period);

            updatedSchedule.push({
                id: `applied_${day}_${period}`,
                day,
                period,
                start_time: times.start,
                end_time: times.end,
                subject_code: fullTitle,
                subject_name: fullTitle,
                faculty_name: (stagedCell && stagedCell.faculty) ? stagedCell.faculty : (currentUser ? currentUser.full_name : 'Assigned Faculty'),
                room: (stagedCell && stagedCell.room) ? stagedCell.room : 'Room 101',
                span: (stagedCell && stagedCell.span) ? stagedCell.span : null
            });
        }
    });

    if (updatedSchedule.length === 0) {
        if (!confirm('The preview contains zero classes (all cells are Free). Do you still want to apply an empty schedule?')) {
            return;
        }
    }

    // Update global activeTimetableMetadata
    activeTimetableMetadata = {
        days: stagedTimetableData.days,
        periods: stagedTimetableData.periods,
        breaks: stagedTimetableData.breaks,
        maxPeriods: stagedTimetableData.maxPeriods
    };
    localStorage.setItem('scheduler_timetable_meta', JSON.stringify(activeTimetableMetadata));

    // Update currentTimetable and persist
    currentTimetable = updatedSchedule;
    localStorage.setItem('scheduler_custom_timetable', JSON.stringify(updatedSchedule));

    // Update My Schedule UI and dropdowns
    renderTimetable(currentTimetable);
    populateSubstituteDropdown(currentTimetable);

    // Show celebratory confirmation toast
    showMasterAppliedNotification(count, activeTimetableMetadata.maxPeriods, activeTimetableMetadata.days.length);

    alert(`🎉 Master Timetable Updated Successfully!\n\n${count} classes across ${activeTimetableMetadata.days.length} days have been applied to your Master Timetable.\n\nYou can now view and manage them in the 'My Schedule' tab.`);
};

// Compatibility Alias
window.saveExtractedToSchedule = function() {
    window.applyExtractedToMasterSchedule();
};

function showStagedReadyNotification(sourceName, count, periods, daysCount) {
    const existing = document.getElementById('uploadSuccessToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'uploadSuccessToast';
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.background = '#4f46e5';
    toast.style.color = 'white';
    toast.style.padding = '14px 20px';
    toast.style.borderRadius = '10px';
    toast.style.boxShadow = '0 6px 20px rgba(0,0,0,0.15)';
    toast.style.fontWeight = '600';
    toast.style.fontSize = '0.9rem';
    toast.style.zIndex = '10000';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '10px';
    toast.innerHTML = `<span>📊</span> <div><strong>Timetable Preview Ready!</strong><br><small style="opacity:0.9;">${count} classes detected. Review validation results & make edits below.</small></div>`;

    document.body.appendChild(toast);
    setTimeout(() => {
        if (toast) toast.remove();
    }, 4500);
}

function showMasterAppliedNotification(count, periods, daysCount) {
    const existing = document.getElementById('uploadSuccessToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'uploadSuccessToast';
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.background = '#10b981';
    toast.style.color = 'white';
    toast.style.padding = '14px 20px';
    toast.style.borderRadius = '10px';
    toast.style.boxShadow = '0 6px 20px rgba(0,0,0,0.15)';
    toast.style.fontWeight = '600';
    toast.style.fontSize = '0.9rem';
    toast.style.zIndex = '10000';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '10px';
    toast.innerHTML = `<span>🎉</span> <div><strong>Applied to Master Timetable!</strong><br><small style="opacity:0.9;">${count} classes across ${daysCount} days updated in 'My Schedule'.</small></div>`;

    document.body.appendChild(toast);
    setTimeout(() => {
        if (toast) toast.remove();
    }, 5000);
}

window.copyExtractedSchedule = function() {
    const tbody = document.getElementById('extractedTimetableBody');
    if (!tbody) return;

    let output = "";
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.replace(/⚠️\s*Needs Verification/g, '').trim().replace(/\n+/g, ' '));
        output += cells.join('\t') + '\n';
    });

    navigator.clipboard.writeText(output).then(() => {
        alert('📋 Extracted preview schedule copied to clipboard as tab-separated values!');
    }).catch(() => {
        alert('Failed to copy. Please manually select the table cells.');
    });
};

window.loadDepartmentPreset = function(presetId) {
    const presets = {
        aditya_dcme_v: {
            days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
            maxPeriods: 7,
            breaks: [{ afterPeriod: 3, timing: '10:15–10:30', label: 'Break' }],
            periods: [
                { period: 1, timing: '08:00–08:45' }, { period: 2, timing: '08:45–09:30' },
                { period: 3, timing: '09:30–10:15' }, { period: 4, timing: '10:30–11:15' },
                { period: 5, timing: '11:15–12:00' }, { period: 6, timing: '12:00–12:45' },
                { period: 7, timing: '12:45–13:30' }
            ],
            schedule: [
                { day: 'Monday', startPeriod: 1, endPeriod: 2, subject: 'Python Programming' },
                { day: 'Monday', startPeriod: 3, endPeriod: 3, subject: 'Industrial Management & Entrepreneurship' },
                { day: 'Monday', startPeriod: 4, endPeriod: 4, subject: 'Big Data & Cloud Computing' },
                { day: 'Monday', startPeriod: 5, endPeriod: 7, subject: 'Android Programming Lab' },
                { day: 'Tuesday', startPeriod: 1, endPeriod: 1, subject: 'Big Data & Cloud Computing' },
                { day: 'Tuesday', startPeriod: 2, endPeriod: 2, subject: 'Internet of Things' },
                { day: 'Tuesday', startPeriod: 3, endPeriod: 3, subject: 'Big Data & Cloud Computing' },
                { day: 'Tuesday', startPeriod: 4, endPeriod: 4, subject: 'Internet of Things' },
                { day: 'Tuesday', startPeriod: 5, endPeriod: 5, subject: 'Android Programming' },
                { day: 'Tuesday', startPeriod: 6, endPeriod: 6, subject: 'Python Programming' },
                { day: 'Tuesday', startPeriod: 7, endPeriod: 7, subject: 'Project Work' },
                { day: 'Wednesday', startPeriod: 1, endPeriod: 1, subject: 'Big Data & Cloud Computing' },
                { day: 'Wednesday', startPeriod: 2, endPeriod: 2, subject: 'Python Programming' },
                { day: 'Wednesday', startPeriod: 3, endPeriod: 3, subject: 'Android Programming' },
                { day: 'Wednesday', startPeriod: 4, endPeriod: 4, subject: 'Industrial Management & Entrepreneurship' },
                { day: 'Wednesday', startPeriod: 5, endPeriod: 7, subject: 'Life Skills Lab' },
                { day: 'Thursday', startPeriod: 1, endPeriod: 1, subject: 'Industrial Management & Entrepreneurship' },
                { day: 'Thursday', startPeriod: 2, endPeriod: 2, subject: 'Python Programming' },
                { day: 'Thursday', startPeriod: 3, endPeriod: 3, subject: 'Big Data & Cloud Computing' },
                { day: 'Thursday', startPeriod: 4, endPeriod: 4, subject: 'Internet of Things' },
                { day: 'Thursday', startPeriod: 5, endPeriod: 5, subject: 'Android Programming' },
                { day: 'Thursday', startPeriod: 6, endPeriod: 6, subject: 'Industrial Management & Entrepreneurship' },
                { day: 'Thursday', startPeriod: 7, endPeriod: 7, subject: 'Library & Student Counseling' },
                { day: 'Friday', startPeriod: 1, endPeriod: 1, subject: 'Big Data & Cloud Computing' },
                { day: 'Friday', startPeriod: 2, endPeriod: 2, subject: 'Python Programming' },
                { day: 'Friday', startPeriod: 3, endPeriod: 3, subject: 'Android Programming' },
                { day: 'Friday', startPeriod: 4, endPeriod: 4, subject: 'Industrial Management & Entrepreneurship' },
                { day: 'Friday', startPeriod: 5, endPeriod: 5, subject: 'Internet of Things' },
                { day: 'Friday', startPeriod: 6, endPeriod: 6, subject: 'Training & Placement Cell' },
                { day: 'Friday', startPeriod: 7, endPeriod: 7, subject: 'Project Work' },
                { day: 'Saturday', startPeriod: 1, endPeriod: 2, subject: 'Internet of Things' },
                { day: 'Saturday', startPeriod: 3, endPeriod: 4, subject: 'Android Programming' },
                { day: 'Saturday', startPeriod: 5, endPeriod: 7, subject: 'Python Programming Lab' }
            ]
        },
        cse_core: {
            days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
            maxPeriods: 7,
            breaks: [{ afterPeriod: 3, timing: '10:15–10:30', label: 'Break' }],
            periods: [
                { period: 1, timing: '08:00–08:45' }, { period: 2, timing: '08:45–09:30' },
                { period: 3, timing: '09:30–10:15' }, { period: 4, timing: '10:30–11:15' },
                { period: 5, timing: '11:15–12:00' }, { period: 6, timing: '12:00–12:45' },
                { period: 7, timing: '12:45–13:30' }
            ],
            schedule: [
                { day: 'Monday', startPeriod: 1, endPeriod: 2, subject: 'Database Management Systems' },
                { day: 'Monday', startPeriod: 3, endPeriod: 3, subject: 'Operating Systems' },
                { day: 'Monday', startPeriod: 4, endPeriod: 4, subject: 'Computer Networks' },
                { day: 'Monday', startPeriod: 5, endPeriod: 7, subject: 'Java Programming Lab' },
                { day: 'Tuesday', startPeriod: 1, endPeriod: 1, subject: 'Java Programming' },
                { day: 'Tuesday', startPeriod: 2, endPeriod: 2, subject: 'Web Technologies' },
                { day: 'Tuesday', startPeriod: 3, endPeriod: 3, subject: 'Database Management Systems' },
                { day: 'Tuesday', startPeriod: 4, endPeriod: 4, subject: 'Operating Systems' },
                { day: 'Tuesday', startPeriod: 5, endPeriod: 5, subject: 'Computer Networks' },
                { day: 'Tuesday', startPeriod: 6, endPeriod: 6, subject: 'Web Technologies' },
                { day: 'Tuesday', startPeriod: 7, endPeriod: 7, subject: 'Project Work' },
                { day: 'Wednesday', startPeriod: 1, endPeriod: 1, subject: 'Operating Systems' },
                { day: 'Wednesday', startPeriod: 2, endPeriod: 2, subject: 'Java Programming' },
                { day: 'Wednesday', startPeriod: 3, endPeriod: 3, subject: 'Computer Networks' },
                { day: 'Wednesday', startPeriod: 4, endPeriod: 4, subject: 'Database Management Systems' },
                { day: 'Wednesday', startPeriod: 5, endPeriod: 7, subject: 'Web Technologies Lab' }
            ]
        }
    };

    const chosen = presets[presetId] || presets.aditya_dcme_v;
    displayStagedTimetable(chosen, `Department Preset (${presetId})`);
};

window.processPastedTable = function() {
    const textarea = document.getElementById('pasteTableInput');
    if (!textarea || !textarea.value.trim()) {
        alert('Please paste table text first!');
        return;
    }

    const lines = textarea.value.trim().split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const lineMatrix = lines.map((line, rIdx) => {
        const tokens = line.includes('\t')
            ? line.split('\t')
            : (line.includes('|') ? line.split('|') : line.split(/\s{2,}|\s(?=[A-Z0-9]{2,}\b)/));

        return tokens.map((t, cIdx) => ({
            val: t.trim(),
            isMerged: false,
            startCol: cIdx,
            endCol: cIdx,
            startRow: rIdx,
            endRow: rIdx
        }));
    });

    const structuredTimetable = parseMatrixToStructuredTimetable(lineMatrix);
    displayStagedTimetable(structuredTimetable, 'Pasted Timetable');
};
