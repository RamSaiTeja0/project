const http = require('http');
const assert = require('assert');

function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runE2ETests() {
  console.log('====================================================');
  console.log('Running TecSubtitution End-to-End Integration Suite');
  console.log('====================================================\n');

  // Step 1: Public Home Page at http://localhost:3000/
  console.log('1. Testing Root URL (http://localhost:3000/)...');
  const homeRes = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/',
    method: 'GET'
  });
  assert.strictEqual(homeRes.status, 200, 'Home page must return 200 OK');
  assert(homeRes.data.includes('TecSubtitution'), 'Must contain exact brand "TecSubtitution"');
  assert(homeRes.data.includes('Smart Faculty Scheduling'), 'Must contain Hero title');
  assert(homeRes.data.includes('id="about"'), 'Must contain About section');
  assert(homeRes.data.includes('id="features"'), 'Must contain Features section');
  assert(homeRes.data.includes('id="how-it-works"'), 'Must contain How It Works section');
  assert(homeRes.data.includes('AI-Assisted Timetable Processing'), 'Must contain AI Processing section');
  assert(homeRes.data.includes('Smart Timetable Management'), 'Must contain Feature 1');
  assert(homeRes.data.includes('AI-Assisted Timetable Extraction'), 'Must contain Feature 2');
  assert(homeRes.data.includes('Timetable Validation'), 'Must contain Feature 3');
  assert(homeRes.data.includes('Editable Preview'), 'Must contain Feature 4');
  assert(homeRes.data.includes('Faculty Substitution'), 'Must contain Feature 5');
  assert(homeRes.data.includes('Attendance Tracking'), 'Must contain Feature 6');
  console.log('   ✓ Public Landing Page renders with all required sections & exact TecSubtitution branding.\n');

  // Step 2: Unauthenticated /api/auth/me
  console.log('2. Testing Session Check on unauthenticated visitor...');
  const meGuestRes = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/me',
    method: 'GET'
  });
  assert.strictEqual(meGuestRes.status, 401, 'Guest must receive 401 unauthenticated');
  console.log('   ✓ Unauthenticated state properly detected.\n');

  // Step 3: Login via API (FAC001 / password123)
  console.log('3. Testing Faculty Login (/api/auth/login)...');
  const loginPayload = JSON.stringify({ faculty_id: 'FAC001', password: 'password123' });
  const loginRes = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginPayload)
    }
  }, loginPayload);

  assert.strictEqual(loginRes.status, 200, 'Login must return 200 OK');
  const loginData = JSON.parse(loginRes.data);
  assert(loginData.user && loginData.user.faculty_id === 'FAC001', 'User must be Dr. Ravi (FAC001)');
  const setCookie = loginRes.headers['set-cookie'];
  assert(setCookie && setCookie.length > 0, 'Session cookie must be set');
  const sessionCookie = setCookie[0].split(';')[0];
  console.log(`   ✓ Login successful for ${loginData.user.full_name} (${loginData.user.faculty_id}). Session cookie issued.\n`);

  // Step 4: Authenticated /api/auth/me
  console.log('4. Testing Session Verification (/api/auth/me)...');
  const meAuthRes = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/me',
    method: 'GET',
    headers: {
      'Cookie': sessionCookie
    }
  });
  assert.strictEqual(meAuthRes.status, 200, 'Authenticated /api/auth/me must return 200');
  const authUser = JSON.parse(meAuthRes.data);
  assert.strictEqual(authUser.faculty_id, 'FAC001');
  console.log('   ✓ Session validated successfully.\n');

  // Step 5: Accessing Dashboard (/dashboard & /index.html)
  console.log('5. Testing Dashboard access (/dashboard & /login)...');
  const dashRes = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/dashboard',
    method: 'GET',
    headers: {
      'Cookie': sessionCookie
    }
  });
  assert.strictEqual(dashRes.status, 200, '/dashboard must return 200 OK');
  assert(dashRes.data.includes('TecSubtitution'), 'Dashboard must display TecSubtitution branding');
  assert(dashRes.data.includes('timetableBody') || dashRes.data.includes('My Schedule'), 'Dashboard must contain timetable schedule component');
  assert(dashRes.data.includes('validationSummaryContainer'), 'Dashboard must contain validation layers');
  console.log('   ✓ Dashboard page rendered with active components and TecSubtitution branding.\n');

  // Step 6: Fetching Active Timetable
  console.log('6. Testing Timetable API (/api/timetable/1)...');
  const ttRes = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/timetable/1',
    method: 'GET',
    headers: {
      'Cookie': sessionCookie
    }
  });
  assert.strictEqual(ttRes.status, 200, 'Timetable API must return 200');
  const ttData = JSON.parse(ttRes.data);
  assert(Array.isArray(ttData) && ttData.length > 0, 'Timetable must contain slots');
  console.log(`   ✓ Timetable data loaded with ${ttData.length} scheduled periods.\n`);

  // Step 7: Testing Substitute Availability Logic
  console.log('7. Testing Substitution Availability API (/api/substitutions/available)...');
  const subRes = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/substitutions/available?date=2026-08-30&day=Monday&period=1',
    method: 'GET',
    headers: {
      'Cookie': sessionCookie
    }
  });
  assert.strictEqual(subRes.status, 200, 'Substitutions API must return 200');
  const subData = JSON.parse(subRes.data);
  assert(Array.isArray(subData), 'Available faculty must be an array');
  console.log(`   ✓ Found ${subData.length} available free faculty for Monday Period 1.\n`);

  // Step 8: Logout
  console.log('8. Testing Logout (/api/auth/logout)...');
  const logoutRes = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/logout',
    method: 'POST',
    headers: {
      'Cookie': sessionCookie
    }
  });
  assert.strictEqual(logoutRes.status, 200, 'Logout must return 200');
  console.log('   ✓ User logged out successfully.\n');

  console.log('====================================================');
  console.log('🎉 ALL 8 E2E INTEGRATION TEST SUITES PASSED 100%!');
  console.log('====================================================');
}

runE2ETests().catch(err => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});
