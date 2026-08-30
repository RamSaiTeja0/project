/**
 * Excel timetable importer (.xlsx).
 *
 * Reads the first worksheet and expects the same columns as the CSV importer:
 *   Day | Period | Subject | Faculty | Class | Room [| SpanTo]
 *
 * The sheet is converted to CSV-equivalent rows and handed to the CSV
 * importer's row logic, so both formats produce an identical source object.
 * There is deliberately no Excel-specific rendering path.
 */
const ExcelJS = require('exceljs');
const csvImporter = require('./csvImporter');

const FORMAT = 'excel';

function cellText(cell) {
    const value = cell == null ? null : cell.value;
    if (value == null) return '';
    if (typeof value === 'object') {
        if (value.richText) return value.richText.map(part => part.text).join('');
        if (value.text) return String(value.text);
        if (value.result !== undefined) return String(value.result);
        if (value instanceof Date) return value.toISOString();
        return '';
    }
    return String(value);
}

async function parse(input, options = {}) {
    const workbook = new ExcelJS.Workbook();

    try {
        await workbook.xlsx.load(Buffer.isBuffer(input) ? input : Buffer.from(input));
    } catch (err) {
        const error = new Error(
            'Could not read the Excel file. Only .xlsx is supported — ' +
            'legacy .xls (binary) files must be re-saved as .xlsx first.');
        error.code = 'UNREADABLE_WORKBOOK';
        error.cause = err;
        throw error;
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) {
        const error = new Error('Excel workbook contains no worksheets');
        error.code = 'EMPTY_FILE';
        throw error;
    }

    const grid = [];
    sheet.eachRow({ includeEmpty: false }, row => {
        const values = [];
        // row.values is 1-based with a leading hole; walk by column count instead.
        for (let c = 1; c <= sheet.columnCount; c++) values.push(cellText(row.getCell(c)));
        grid.push(values);
    });

    if (grid.length === 0) {
        const error = new Error('Excel worksheet is empty');
        error.code = 'EMPTY_FILE';
        throw error;
    }

    // Re-encode as CSV so both importers share one row parser.
    const csv = grid
        .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const result = csvImporter.parse(csv, options);
    return { ...result, format: FORMAT, sheetName: sheet.name };
}

module.exports = { parse, FORMAT };
