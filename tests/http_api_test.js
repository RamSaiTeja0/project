const http = require('http');
const assert = require('assert');

function get(path) {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:3000${path}`, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        }).on('error', reject);
    });
}

async function run() {
    console.log('Testing HTTP Endpoints on http://localhost:3000...');

    // 1. Check index.html loads with all components
    const indexRes = await get('/index.html');
    assert.strictEqual(indexRes.status, 200, 'index.html must return 200');
    assert(indexRes.data.includes('validationSummaryContainer'), 'Must include validationSummaryContainer');
    assert(indexRes.data.includes('extractedGridContainer'), 'Must include extractedGridContainer');
    assert(indexRes.data.includes('rawOcrDetails'), 'Must include rawOcrDetails');
    assert(indexRes.data.includes('normalizedDetails'), 'Must include normalizedDetails');
    console.log('✓ index.html has all required UI layers');

    // 2. Check demo_2.html loads with all components
    const demoRes = await get('/demo_2.html');
    assert.strictEqual(demoRes.status, 200, 'demo_2.html must return 200');
    assert(demoRes.data.includes('validationSummaryContainer'), 'Must include validationSummaryContainer in demo_2.html');
    assert(demoRes.data.includes('extractedGridContainer'), 'Must include extractedGridContainer in demo_2.html');
    assert(demoRes.data.includes('rawOcrDetails'), 'Must include rawOcrDetails in demo_2.html');
    assert(demoRes.data.includes('normalizedDetails'), 'Must include normalizedDetails in demo_2.html');
    console.log('✓ demo_2.html has all required UI layers');

    // 3. Check public/js/app.js is accessible
    const appRes = await get('/public/js/app.js');
    assert.strictEqual(appRes.status, 200, 'app.js must return 200');
    assert(appRes.data.includes('validateTimetableStructure'), 'app.js must contain validateTimetableStructure');
    assert(appRes.data.includes('parseOcrSpatialGeometry'), 'app.js must contain parseOcrSpatialGeometry');
    assert(appRes.data.includes('displayStagedTimetable'), 'app.js must contain displayStagedTimetable');
    assert(appRes.data.includes('applyExtractedToMasterSchedule'), 'app.js must contain applyExtractedToMasterSchedule');
    console.log('✓ app.js is served properly with updated functions');

    console.log('🎉 All HTTP Integration tests passed successfully!');
}

run().catch(err => {
    console.error('HTTP Test Error:', err);
    process.exit(1);
});
