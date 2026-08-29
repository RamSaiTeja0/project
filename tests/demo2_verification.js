const http = require('http');
const assert = require('assert');

function get(url) {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:3000${url}`, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve({ status: res.statusCode, data: d }));
        }).on('error', reject);
    });
}

async function verify() {
    console.log('Testing demo_2.html integration...');

    const res = await get('/demo_2.html');
    assert.strictEqual(res.status, 200, 'demo_2.html must return 200 OK');
    const html = res.data;

    // 1. Check navigation & brand
    assert(html.includes('TecSubstitution'), 'Must contain TecSubstitution');
    assert(html.includes('Home'), 'Must contain Home navigation');
    assert(html.includes('My Schedule'), 'Must preserve My Schedule');
    assert(html.includes('Adjust/Substitute'), 'Must preserve Adjust/Substitute');
    assert(html.includes('Upload Paper Sheet'), 'Must preserve Upload Paper Sheet');
    assert(html.includes('Attendance Track'), 'Must preserve Attendance Track');

    // 2. Check Hero section
    assert(html.includes('id="home-section"'), 'Must contain home-section tab');
    assert(html.includes('SMART TECHNOLOGY SUBSTITUTION'), 'Must contain badge');
    assert(html.includes('Find the'), 'Must contain hero title');
    assert(html.includes('Right Alternative'), 'Must contain Right Alternative');
    assert(html.includes('Explore Alternatives'), 'Must contain Explore Alternatives button');
    assert(html.includes('How It Works'), 'Must contain How It Works button');
    assert(html.includes('CURRENT TECHNOLOGY'), 'Must contain CURRENT TECHNOLOGY');
    assert(html.includes('REQUIREMENT ANALYSIS'), 'Must contain REQUIREMENT ANALYSIS');
    assert(html.includes('ALTERNATIVE TECHNOLOGIES'), 'Must contain ALTERNATIVE TECHNOLOGIES');

    // 3. Check Features
    assert(html.includes('Everything You Need to Find Better Alternatives'), 'Must contain features header');
    assert(html.includes('Smart Substitution'), 'Must contain Smart Substitution');
    assert(html.includes('Requirement Matching'), 'Must contain Requirement Matching');
    assert(html.includes('Technology Comparison'), 'Must contain Technology Comparison');
    assert(html.includes('Compatibility'), 'Must contain Compatibility');
    assert(html.includes('Cost Awareness'), 'Must contain Cost Awareness');
    assert(html.includes('Intelligent Recommendations'), 'Must contain Intelligent Recommendations');

    // 4. Check How It Works
    assert(html.includes('How TecSubstitution Works'), 'Must contain How It Works');
    assert(html.includes('Enter Your Requirement'), 'Must contain Step 01');
    assert(html.includes('Analyze'), 'Must contain Step 02');
    assert(html.includes('Discover Alternatives'), 'Must contain Step 03');
    assert(html.includes('Compare &amp; Choose') || html.includes('Compare & Choose'), 'Must contain Step 04');

    // 5. Check Why TecSubstitution
    assert(html.includes('Making Technology Choices Simpler'), 'Must contain Why TecSubstitution header');
    assert(html.includes('DISCOVER'), 'Must contain DISCOVER');
    assert(html.includes('COMPARE'), 'Must contain COMPARE');
    assert(html.includes('CHOOSE'), 'Must contain CHOOSE');

    // 6. Check Final CTA & Authentication
    assert(html.includes('Ready to Explore Better Technology Alternatives?'), 'Must contain CTA title');
    assert(html.includes('SIGN IN'), 'Must contain SIGN IN button');
    assert(html.includes('CREATE ACCOUNT'), 'Must contain CREATE ACCOUNT button');
    assert(html.includes('id="login-overlay"'), 'Must preserve existing login overlay');

    // 7. Check Existing Application Tabs
    assert(html.includes('id="timetable"'), 'Must preserve timetable tab');
    assert(html.includes('id="substitute"'), 'Must preserve substitute tab');
    assert(html.includes('id="scan"'), 'Must preserve scan tab');
    assert(html.includes('id="attendance"'), 'Must preserve attendance tab');
    assert(html.includes('timetableBody'), 'Must preserve timetableBody table');

    console.log('✓ All 7 major integration check suites passed with 100% success!');
}

verify().catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
});
