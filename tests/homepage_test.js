const http = require('http');
const assert = require('assert');

function get(path) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000' + path, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function verify() {
  console.log('Testing Home Page and Routing...');
  
  // 1. Check Root (/) serves TecSubtitution Home Page
  const rootRes = await get('/');
  assert.strictEqual(rootRes.status, 200, 'Root / must return 200 OK');
  assert(rootRes.data.includes('TecSubtitution'), 'Root must contain TecSubtitution branding');
  assert(rootRes.data.includes('Smart Faculty Scheduling'), 'Root must contain Hero title');
  assert(rootRes.data.includes('id="about"'), 'Root must contain About section');
  assert(rootRes.data.includes('id="features"'), 'Root must contain Features section');
  assert(rootRes.data.includes('id="how-it-works"'), 'Root must contain How It Works section');
  assert(rootRes.data.includes('AI-Assisted Timetable Processing'), 'Root must contain AI processing section');
  assert(rootRes.data.includes('Ready to simplify faculty scheduling?'), 'Root must contain CTA');
  console.log('✓ Root route (/) successfully serves the new TecSubtitution Home Page');

  // 2. Check /home serves Home Page
  const homeRes = await get('/home');
  assert.strictEqual(homeRes.status, 200, '/home must return 200 OK');
  assert(homeRes.data.includes('TecSubtitution'), '/home must contain TecSubtitution');
  console.log('✓ /home route successfully serves the Home Page');

  // 3. Check /login and /dashboard serve index.html (Portal/Dashboard)
  const loginRes = await get('/login');
  assert.strictEqual(loginRes.status, 200, '/login must return 200 OK');
  assert(loginRes.data.includes('login-card') || loginRes.data.includes('loginForm'), '/login must serve login/dashboard');
  assert(loginRes.data.includes('TecSubtitution'), '/login must contain TecSubtitution branding');
  console.log('✓ /login route successfully serves the Portal/Dashboard with TecSubtitution branding');

  const dashRes = await get('/dashboard');
  assert.strictEqual(dashRes.status, 200, '/dashboard must return 200 OK');
  assert(dashRes.data.includes('validationSummaryContainer'), '/dashboard must include validationSummaryContainer');
  console.log('✓ /dashboard route successfully serves the Dashboard');

  // 4. Check index.html is accessible
  const indexRes = await get('/index.html');
  assert.strictEqual(indexRes.status, 200, '/index.html must return 200 OK');
  console.log('✓ /index.html is accessible');

  // 5. Check demo_2.html is accessible
  const demoRes = await get('/demo_2.html');
  assert.strictEqual(demoRes.status, 200, '/demo_2.html must return 200 OK');
  console.log('✓ /demo_2.html is accessible');

  // 6. Check static assets
  const cssRes = await get('/public/css/home.css');
  assert.strictEqual(cssRes.status, 200, 'home.css must return 200 OK');
  const jsRes = await get('/public/js/home.js');
  assert.strictEqual(jsRes.status, 200, 'home.js must return 200 OK');
  const appJsRes = await get('/public/js/app.js');
  assert.strictEqual(appJsRes.status, 200, 'app.js must return 200 OK');
  console.log('✓ All CSS and JS static assets load correctly (200 OK)');

  console.log('🎉 ALL HOME PAGE & ROUTING VERIFICATIONS PASSED 100%!');
}

verify().catch(e => {
  console.error('Verification failed:', e.message);
  process.exit(1);
});
