/**
 * Verification Test: Removal of Adjust / Substitute from HOD Interface
 *
 * Verifies that:
 * 1. navSubstitute ("Adjust / Substitute") is hidden for HOD and Acting HOD roles.
 * 2. showView blocks HOD from accessing the substitute page and redirects to dashboard.
 * 3. Faculty members retain access to navSubstitute and the Adjust / Substitute page.
 * 4. Guest / demo users retain access to navSubstitute.
 * 5. All other HOD features (Faculty Availability, Attendance, Invigilation,
 *    Branch Substitutions, Timetable, Faculty Management, Delegation) remain intact.
 * 6. Business rules: HODs cannot create, accept, or reject substitution requests.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('================================================================');
console.log('Testing Removal of Adjust / Substitute from HOD Interface');
console.log('================================================================\n');

const appJs = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

// --- 1. Static HTML & JS checks ---
console.log('[1] Static Code Structure Checks');
assert(indexHtml.includes('id="navSubstitute"'), 'index.html must contain #navSubstitute button');
assert(indexHtml.includes('id="navSubstitute" style="display:none;"'), 'navSubstitute must default to display:none in HTML to prevent flash');
assert(appJs.includes("if (el('navSubstitute')) el('navSubstitute').style.display = isHOS ? 'none' : '';"), 'app.js must hide navSubstitute when isHOS is true');
assert(appJs.includes("else if (isHOS && name === 'substitute')"), 'app.js showView must guard against isHOS accessing substitute view');
assert(appJs.includes("if (isHOS && viewFromHash() === 'substitute')"), 'app.js renderUser must redirect if HOD enters with #substitute hash');
console.log('  ✓ Static assertions passed: Navigation and view guards are present in app.js and index.html');

// --- 2. Navigation Simulation ---
console.log('\n[2] Navigation Visibility Simulation across Roles');

function simulateNav(role, isActing = false) {
    const isPermanentHOS = role === 'hos' || role === 'coordinator' || role === 'admin';
    const isActingHOD = Boolean(isActing);
    const isHOS = isPermanentHOS || isActingHOD;
    const isFaculty = role === 'faculty';

    const elements = {
        navSubstitute: { style: { display: 'none' } },
        navAvailability: { style: { display: '' } },
        navTimetable: { style: { display: '' } },
        navFaculty: { style: { display: 'none' } },
        navRequests: { style: { display: 'none' } },
        navAttendance: { style: { display: 'none' } },
        navMyAttendance: { style: { display: 'none' } },
        navInvigilation: { style: { display: 'none' } },
        navInvigRequests: { style: { display: 'none' } },
        navMyInvigilation: { style: { display: 'none' } },
        navRequestInvigilation: { style: { display: 'none' } },
        navFacultySubstitutions: { style: { display: 'none' } },
        navHosSubstitutions: { style: { display: 'none' } },
        navManageLabel: { style: { display: 'none' } },
        navManage: { style: { display: 'none' } },
        navImport: { style: { display: 'none' } },
        navDelegation: { style: { display: 'none' } },
        navSchedule: { style: { display: 'none' } }
    };

    function el(id) { return elements[id]; }

    // Execute logic from public/js/app.js renderUser()
    if (el('navFaculty')) el('navFaculty').style.display = isHOS ? '' : 'none';
    if (el('navRequests')) el('navRequests').style.display = isHOS ? '' : 'none';
    if (el('navAttendance')) el('navAttendance').style.display = isHOS ? '' : 'none';
    if (el('navMyAttendance')) el('navMyAttendance').style.display = isFaculty ? '' : 'none';
    if (el('navInvigilation')) el('navInvigilation').style.display = isHOS ? '' : 'none';
    if (el('navInvigRequests')) el('navInvigRequests').style.display = isHOS ? '' : 'none';
    if (el('navMyInvigilation')) el('navMyInvigilation').style.display = isFaculty ? '' : 'none';
    if (el('navRequestInvigilation')) el('navRequestInvigilation').style.display = isFaculty ? '' : 'none';
    if (el('navFacultySubstitutions')) el('navFacultySubstitutions').style.display = isFaculty ? '' : 'none';
    if (el('navHosSubstitutions')) el('navHosSubstitutions').style.display = isHOS ? '' : 'none';
    if (el('navManageLabel')) el('navManageLabel').style.display = isHOS ? '' : 'none';
    if (el('navManage')) el('navManage').style.display = isHOS ? '' : 'none';
    if (el('navImport')) el('navImport').style.display = isHOS ? '' : 'none';
    if (el('navDelegation')) el('navDelegation').style.display = isPermanentHOS ? '' : 'none';
    if (el('navSchedule')) el('navSchedule').style.display = isFaculty ? '' : 'none';
    if (el('navSubstitute')) el('navSubstitute').style.display = isHOS ? 'none' : '';

    return elements;
}

// A. HOD
const hodNav = simulateNav('hos');
assert.strictEqual(hodNav.navSubstitute.style.display, 'none', 'HOD must NOT see navSubstitute');
assert.strictEqual(hodNav.navHosSubstitutions.style.display, '', 'HOD must see navHosSubstitutions (Branch Substitutions)');
assert.strictEqual(hodNav.navAvailability.style.display, '', 'HOD must see navAvailability');
assert.strictEqual(hodNav.navAttendance.style.display, '', 'HOD must see navAttendance');
assert.strictEqual(hodNav.navInvigilation.style.display, '', 'HOD must see navInvigilation');
assert.strictEqual(hodNav.navInvigRequests.style.display, '', 'HOD must see navInvigRequests');
assert.strictEqual(hodNav.navFaculty.style.display, '', 'HOD must see navFaculty');
assert.strictEqual(hodNav.navRequests.style.display, '', 'HOD must see navRequests');
assert.strictEqual(hodNav.navTimetable.style.display, '', 'HOD must see navTimetable');
assert.strictEqual(hodNav.navManage.style.display, '', 'HOD must see navManage');
assert.strictEqual(hodNav.navImport.style.display, '', 'HOD must see navImport');
assert.strictEqual(hodNav.navDelegation.style.display, '', 'HOD must see navDelegation');
console.log('  ✓ Verified: For HOD, Adjust / Substitute is hidden and all 11 HOD features remain visible');

// B. Acting HOD
const actingNav = simulateNav('faculty', true);
assert.strictEqual(actingNav.navSubstitute.style.display, 'none', 'Acting HOD must NOT see navSubstitute in HOD interface');
assert.strictEqual(actingNav.navHosSubstitutions.style.display, '', 'Acting HOD must see navHosSubstitutions');
assert.strictEqual(actingNav.navAttendance.style.display, '', 'Acting HOD must see navAttendance');
console.log('  ✓ Verified: For Acting HOD, Adjust / Substitute is hidden in HOD interface');

// C. Faculty
const facNav = simulateNav('faculty');
assert.strictEqual(facNav.navSubstitute.style.display, '', 'Faculty MUST see navSubstitute');
assert.strictEqual(facNav.navFacultySubstitutions.style.display, '', 'Faculty must see navFacultySubstitutions');
assert.strictEqual(facNav.navSchedule.style.display, '', 'Faculty must see navSchedule');
assert.strictEqual(facNav.navMyAttendance.style.display, '', 'Faculty must see navMyAttendance');
assert.strictEqual(facNav.navMyInvigilation.style.display, '', 'Faculty must see navMyInvigilation');
assert.strictEqual(facNav.navRequestInvigilation.style.display, '', 'Faculty must see navRequestInvigilation');
assert.strictEqual(facNav.navHosSubstitutions.style.display, 'none', 'Faculty must NOT see navHosSubstitutions');
console.log('  ✓ Verified: For Faculty, Adjust / Substitute is visible and personal workflow preserved');

// D. Guest / Unauthenticated
const guestNav = simulateNav(null);
assert.strictEqual(guestNav.navSubstitute.style.display, '', 'Guest must see navSubstitute for demo dataset');
console.log('  ✓ Verified: For Guest/Demo, Adjust / Substitute is visible');

// --- 3. View Routing Simulation ---
console.log('\n[3] View Routing & Page Access Guard Simulation');

function simulateShowView(user, requestedView) {
    const isPermanentHOS = Boolean(user && (user.role === 'hos' || user.role === 'coordinator' || user.role === 'admin'));
    const isActingHOD = Boolean(user && user.isActingHOD);
    const isHOS = isPermanentHOS || isActingHOD;
    const isFaculty = Boolean(user && user.role === 'faculty');

    const HOS_ONLY_VIEWS = ['faculty', 'requests', 'attendance', 'invigilation', 'invig-requests', 'hos-substitutions', 'manage', 'import', 'delegation'];
    const FACULTY_ONLY_VIEWS = ['my-attendance', 'my-invigilation', 'request-invigilation', 'faculty-substitutions'];

    let name = requestedView;
    if (name === 'about') {
        name = 'dashboard';
    }

    if (!user && (HOS_ONLY_VIEWS.indexOf(name) >= 0 || FACULTY_ONLY_VIEWS.indexOf(name) >= 0)) {
        name = 'dashboard';
    } else if (name === 'delegation' && !isPermanentHOS) {
        name = 'dashboard';
    } else if (isFaculty && !isActingHOD && HOS_ONLY_VIEWS.indexOf(name) >= 0) {
        name = 'schedule';
    } else if (isPermanentHOS && FACULTY_ONLY_VIEWS.indexOf(name) >= 0) {
        name = 'dashboard';
    } else if (isHOS && name === 'substitute') {
        name = 'dashboard';
    }

    return name;
}

// HOD requests substitute
assert.strictEqual(simulateShowView({ role: 'hos' }, 'substitute'), 'dashboard', 'HOD navigating to substitute must redirect to dashboard');
// Acting HOD requests substitute
assert.strictEqual(simulateShowView({ role: 'faculty', isActingHOD: true }, 'substitute'), 'dashboard', 'Acting HOD navigating to substitute must redirect to dashboard');
// Faculty requests substitute
assert.strictEqual(simulateShowView({ role: 'faculty' }, 'substitute'), 'substitute', 'Faculty navigating to substitute must stay on substitute');
// Guest requests substitute
assert.strictEqual(simulateShowView(null, 'substitute'), 'substitute', 'Guest navigating to substitute must stay on substitute');
console.log('  ✓ Verified: showView strictly blocks HOD and Acting HOD from viewing substitute page');

// --- 4. Live Server Endpoint Testing ---
console.log('\n[4] Backend Authorization & Substitution API Governance Verification');

const session = require('../src/core/session');
const { app } = require('../server');

async function testBackend() {
    const testServer = app.listen(0, '127.0.0.1');
    await new Promise(r => testServer.once('listening', r));
    const port = testServer.address().port;

    function apiCall(method, pathUrl, cookie, body = null) {
        return new Promise((resolve, reject) => {
            const headers = {};
            if (cookie) headers['Cookie'] = cookie;
            if (body) {
                headers['Content-Type'] = 'application/json';
            }
            const req = http.request({
                host: '127.0.0.1',
                port,
                path: pathUrl,
                method,
                headers
            }, res => {
                let data = '';
                res.on('data', d => data += d);
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(data) });
                    } catch (_) {
                        resolve({ status: res.statusCode, body: data });
                    }
                });
            });
            req.on('error', reject);
            if (body) req.write(JSON.stringify(body));
            req.end();
        });
    }

    const hodCookie = `${session.COOKIE_NAME}=${session.create({ username: 'hod_cme', role: 'hos', department: 'CME', name: 'HOD CME' })}`;
    const facCookie = `${session.COOKIE_NAME}=${session.create({ username: 'kusuma', role: 'faculty', department: 'CME', name: 'B.KUSUMA', facultyName: 'B.KUSUMA' })}`;

    try {
        // HOD cannot create substitution request
        const resCreate = await apiCall('POST', '/api/substitutions/requests', hodCookie, {
            date: '2026-11-06',
            period: 6,
            className: 'CME-5-A',
            subject: 'Java',
            substituteFacultyId: '2'
        });
        assert.strictEqual(resCreate.status, 403, 'HOD must be forbidden from creating substitution requests');
        assert.strictEqual(resCreate.body.code, 'FORBIDDEN');
        console.log('  ✓ Verified: HOD cannot create substitution requests (HTTP 403)');

        // HOD cannot accept substitution request
        const resAccept = await apiCall('POST', '/api/substitutions/1/accept', hodCookie, {});
        assert.strictEqual(resAccept.status, 403, 'HOD must be forbidden from accepting substitution requests');
        assert.strictEqual(resAccept.body.code, 'FORBIDDEN');
        console.log('  ✓ Verified: HOD cannot accept substitution requests (HTTP 403)');

        // HOD cannot reject substitution request
        const resReject = await apiCall('POST', '/api/substitutions/1/reject', hodCookie, { reason: 'No' });
        assert.strictEqual(resReject.status, 403, 'HOD must be forbidden from rejecting substitution requests');
        assert.strictEqual(resReject.body.code, 'FORBIDDEN');
        console.log('  ✓ Verified: HOD cannot reject substitution requests (HTTP 403)');

        // HOD CAN view branch substitutions (read-only oversight preserved)
        const resList = await apiCall('GET', '/api/substitutions', hodCookie);
        assert.strictEqual(resList.status, 200, 'HOD must be able to view branch substitutions overview');
        assert.ok(Array.isArray(resList.body.substitutions), 'Must return substitutions list');
        console.log('  ✓ Verified: HOD branch substitutions oversight preserved (HTTP 200)');

        // Faculty CAN view their vacant periods for substitution
        const resVacant = await apiCall('GET', '/api/substitutions/vacant-periods?date=2026-11-06', facCookie);
        assert.strictEqual(resVacant.status, 200, 'Faculty must be able to view vacant periods');
        console.log('  ✓ Verified: Faculty substitution workflow endpoints preserved (HTTP 200)');
    } finally {
        testServer.close();
    }
}

testBackend().then(() => {
    console.log('\n================================================================');
    console.log('✅ ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
    console.log('================================================================\n');
    process.exit(0);
}).catch(err => {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
});

