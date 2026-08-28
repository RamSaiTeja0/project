/**
 * In-Memory Temporary Database Engine
 * Zero external database setup required.
 * Keeps data in memory during runtime with full support for users, branches, timetable, and substitutions.
 */
const bcrypt = require('bcryptjs');

// Pre-hashed 'password123'
const DEFAULT_PW_HASH = bcrypt.hashSync('password123', 10);

const TempDB = {
    users: [
        { id: 1, faculty_id: 'HOS001', full_name: 'Dr. Smith', email: 'smith@college.edu', phone: '1234567890', department: 'CSE', password_hash: DEFAULT_PW_HASH, role: 'hos' },
        { id: 2, faculty_id: 'FAC001', full_name: 'Dr. Ravi', email: 'ravi@college.edu', phone: '0987654321', department: 'CSE', password_hash: DEFAULT_PW_HASH, role: 'faculty' },
        { id: 3, faculty_id: 'FAC002', full_name: 'Dr. Anitha', email: 'anitha@college.edu', phone: '1112223333', department: 'CSE', password_hash: DEFAULT_PW_HASH, role: 'faculty' },
        { id: 4, faculty_id: 'FAC003', full_name: 'Prof. Kiran', email: 'kiran@college.edu', phone: '4445556666', department: 'CSE', password_hash: DEFAULT_PW_HASH, role: 'faculty' },
        { id: 5, faculty_id: 'FAC004', full_name: 'Prof. Priya', email: 'priya@college.edu', phone: '7778889999', department: 'CSE', password_hash: DEFAULT_PW_HASH, role: 'faculty' }
    ],

    branches: [
        { id: 1, department: 'CSE', branch_name: 'CSE-A', year: 'III Year', section: 'A', hos_id: 1 },
        { id: 2, department: 'CSE', branch_name: 'CSE-B', year: 'III Year', section: 'B', hos_id: 1 }
    ],

    subjects: [
        { id: 1, subject_code: 'CS301', subject_name: 'DBMS', department: 'CSE' },
        { id: 2, subject_code: 'CS302', subject_name: 'OS', department: 'CSE' },
        { id: 3, subject_code: 'CS303', subject_name: 'CN', department: 'CSE' },
        { id: 4, subject_code: 'CS304', subject_name: 'Java', department: 'CSE' },
        { id: 5, subject_code: 'CS305', subject_name: 'Python Programming', department: 'CSE' },
        { id: 6, subject_code: 'CS306', subject_name: 'Big Data & Cloud Computing', department: 'CSE' },
        { id: 7, subject_code: 'CS307', subject_name: 'Internet of Things', department: 'CSE' },
        { id: 8, subject_code: 'CS308', subject_name: 'Industrial Management & Entrepreneurship', department: 'CSE' },
        { id: 9, subject_code: 'CS309', subject_name: 'Life Skills Lab', department: 'CSE' },
        { id: 10, subject_code: 'CS310', subject_name: 'Project Work', department: 'CSE' },
        { id: 11, subject_code: 'CS311', subject_name: 'Training & Placement Cell', department: 'CSE' },
        { id: 12, subject_code: 'CS312', subject_name: 'Library & Student Counseling', department: 'CSE' },
        { id: 13, subject_code: 'CS313', subject_name: 'Android Programming Lab', department: 'CSE' },
        { id: 14, subject_code: 'CS314', subject_name: 'Android Programming', department: 'CSE' },
        { id: 15, subject_code: 'CS315', subject_name: 'Python Programming Lab', department: 'CSE' }
    ],

    timetable: [
        // Monday CSE-A
        { id: 1, branch_id: 1, day: 'Monday', period: 1, start_time: '08:00', end_time: '08:45', subject_id: 5, faculty_id: 2, room: 'Room 101' },
        { id: 2, branch_id: 1, day: 'Monday', period: 2, start_time: '08:45', end_time: '09:30', subject_id: 5, faculty_id: 2, room: 'Room 101' },
        { id: 3, branch_id: 1, day: 'Monday', period: 3, start_time: '09:30', end_time: '10:15', subject_id: 8, faculty_id: 5, room: 'Room 101' },
        { id: 4, branch_id: 1, day: 'Monday', period: 4, start_time: '10:30', end_time: '11:15', subject_id: 6, faculty_id: 3, room: 'Room 101' },
        { id: 5, branch_id: 1, day: 'Monday', period: 5, start_time: '11:15', end_time: '12:00', subject_id: 13, faculty_id: 4, room: 'Lab 2' },
        { id: 6, branch_id: 1, day: 'Monday', period: 6, start_time: '12:00', end_time: '12:45', subject_id: 13, faculty_id: 4, room: 'Lab 2' },
        { id: 7, branch_id: 1, day: 'Monday', period: 7, start_time: '12:45', end_time: '13:30', subject_id: 13, faculty_id: 4, room: 'Lab 2' },

        // Tuesday CSE-A
        { id: 8, branch_id: 1, day: 'Tuesday', period: 1, start_time: '08:00', end_time: '08:45', subject_id: 6, faculty_id: 3, room: 'Room 101' },
        { id: 9, branch_id: 1, day: 'Tuesday', period: 2, start_time: '08:45', end_time: '09:30', subject_id: 7, faculty_id: 2, room: 'Room 101' },
        { id: 10, branch_id: 1, day: 'Tuesday', period: 3, start_time: '09:30', end_time: '10:15', subject_id: 6, faculty_id: 3, room: 'Room 101' },
        { id: 11, branch_id: 1, day: 'Tuesday', period: 4, start_time: '10:30', end_time: '11:15', subject_id: 7, faculty_id: 2, room: 'Room 101' },
        { id: 12, branch_id: 1, day: 'Tuesday', period: 5, start_time: '11:15', end_time: '12:00', subject_id: 14, faculty_id: 4, room: 'Room 101' },
        { id: 13, branch_id: 1, day: 'Tuesday', period: 6, start_time: '12:00', end_time: '12:45', subject_id: 5, faculty_id: 2, room: 'Room 101' },
        { id: 14, branch_id: 1, day: 'Tuesday', period: 7, start_time: '12:45', end_time: '13:30', subject_id: 10, faculty_id: 1, room: 'Lab 1' },

        // Wednesday CSE-A
        { id: 15, branch_id: 1, day: 'Wednesday', period: 1, start_time: '08:00', end_time: '08:45', subject_id: 6, faculty_id: 3, room: 'Room 101' },
        { id: 16, branch_id: 1, day: 'Wednesday', period: 2, start_time: '08:45', end_time: '09:30', subject_id: 5, faculty_id: 2, room: 'Room 101' },
        { id: 17, branch_id: 1, day: 'Wednesday', period: 3, start_time: '09:30', end_time: '10:15', subject_id: 14, faculty_id: 4, room: 'Room 101' },
        { id: 18, branch_id: 1, day: 'Wednesday', period: 4, start_time: '10:30', end_time: '11:15', subject_id: 8, faculty_id: 5, room: 'Room 101' },
        { id: 19, branch_id: 1, day: 'Wednesday', period: 5, start_time: '11:15', end_time: '12:00', subject_id: 9, faculty_id: 1, room: 'Lab 3' },
        { id: 20, branch_id: 1, day: 'Wednesday', period: 6, start_time: '12:00', end_time: '12:45', subject_id: 9, faculty_id: 1, room: 'Lab 3' },
        { id: 21, branch_id: 1, day: 'Wednesday', period: 7, start_time: '12:45', end_time: '13:30', subject_id: 9, faculty_id: 1, room: 'Lab 3' },

        // Thursday CSE-A
        { id: 22, branch_id: 1, day: 'Thursday', period: 1, start_time: '08:00', end_time: '08:45', subject_id: 8, faculty_id: 5, room: 'Room 101' },
        { id: 23, branch_id: 1, day: 'Thursday', period: 2, start_time: '08:45', end_time: '09:30', subject_id: 5, faculty_id: 2, room: 'Room 101' },
        { id: 24, branch_id: 1, day: 'Thursday', period: 3, start_time: '09:30', end_time: '10:15', subject_id: 6, faculty_id: 3, room: 'Room 101' },
        { id: 25, branch_id: 1, day: 'Thursday', period: 4, start_time: '10:30', end_time: '11:15', subject_id: 7, faculty_id: 2, room: 'Room 101' },
        { id: 26, branch_id: 1, day: 'Thursday', period: 5, start_time: '11:15', end_time: '12:00', subject_id: 14, faculty_id: 4, room: 'Room 101' },
        { id: 27, branch_id: 1, day: 'Thursday', period: 6, start_time: '12:00', end_time: '12:45', subject_id: 8, faculty_id: 5, room: 'Room 101' },
        { id: 28, branch_id: 1, day: 'Thursday', period: 7, start_time: '12:45', end_time: '13:30', subject_id: 12, faculty_id: 1, room: 'Library' },

        // Friday CSE-A
        { id: 29, branch_id: 1, day: 'Friday', period: 1, start_time: '08:00', end_time: '08:45', subject_id: 6, faculty_id: 3, room: 'Room 101' },
        { id: 30, branch_id: 1, day: 'Friday', period: 2, start_time: '08:45', end_time: '09:30', subject_id: 5, faculty_id: 2, room: 'Room 101' },
        { id: 31, branch_id: 1, day: 'Friday', period: 3, start_time: '09:30', end_time: '10:15', subject_id: 14, faculty_id: 4, room: 'Room 101' },
        { id: 32, branch_id: 1, day: 'Friday', period: 4, start_time: '10:30', end_time: '11:15', subject_id: 8, faculty_id: 5, room: 'Room 101' },
        { id: 33, branch_id: 1, day: 'Friday', period: 5, start_time: '11:15', end_time: '12:00', subject_id: 7, faculty_id: 2, room: 'Room 101' },
        { id: 34, branch_id: 1, day: 'Friday', period: 6, start_time: '12:00', end_time: '12:45', subject_id: 11, faculty_id: 1, room: 'Auditorium' },
        { id: 35, branch_id: 1, day: 'Friday', period: 7, start_time: '12:45', end_time: '13:30', subject_id: 10, faculty_id: 1, room: 'Lab 1' },

        // Saturday CSE-A
        { id: 36, branch_id: 1, day: 'Saturday', period: 1, start_time: '08:00', end_time: '08:45', subject_id: 7, faculty_id: 2, room: 'Room 101' },
        { id: 37, branch_id: 1, day: 'Saturday', period: 2, start_time: '08:45', end_time: '09:30', subject_id: 7, faculty_id: 2, room: 'Room 101' },
        { id: 38, branch_id: 1, day: 'Saturday', period: 3, start_time: '09:30', end_time: '10:15', subject_id: 14, faculty_id: 4, room: 'Room 101' },
        { id: 39, branch_id: 1, day: 'Saturday', period: 4, start_time: '10:30', end_time: '11:15', subject_id: 14, faculty_id: 4, room: 'Room 101' },
        { id: 40, branch_id: 1, day: 'Saturday', period: 5, start_time: '11:15', end_time: '12:00', subject_id: 15, faculty_id: 2, room: 'Lab 1' },
        { id: 41, branch_id: 1, day: 'Saturday', period: 6, start_time: '12:00', end_time: '12:45', subject_id: 15, faculty_id: 2, room: 'Lab 1' },
        { id: 42, branch_id: 1, day: 'Saturday', period: 7, start_time: '12:45', end_time: '13:30', subject_id: 15, faculty_id: 2, room: 'Lab 1' }
    ],

    substitutions: []
};

let nextUserId = 100;
let nextTimetableId = 200;
let nextSubId = 300;

const db = {
    async query(sql, params = []) {
        const queryStr = String(sql).trim();
        const upper = queryStr.toUpperCase();

        // 1. SELECT * FROM users WHERE UPPER(TRIM(faculty_id)) = $1 or UPPER(TRIM(full_name)) = $1
        if (upper.startsWith('SELECT') && upper.includes('FROM USERS') && !upper.includes('NOT IN')) {
            if (upper.includes('FACULTY_ID')) {
                const target = params[0] ? String(params[0]).trim().toUpperCase() : '';
                const user = TempDB.users.find(u => u.faculty_id && u.faculty_id.toUpperCase() === target);
                return { rows: user ? [{ ...user }] : [] };
            }
            if (upper.includes('FULL_NAME')) {
                const target = params[0] ? String(params[0]).trim().toUpperCase() : '';
                const user = TempDB.users.find(u => u.full_name && u.full_name.trim().toUpperCase() === target);
                return { rows: user ? [{ ...user }] : [] };
            }
            return { rows: TempDB.users.map(u => ({ ...u })) };
        }

        // 2. INSERT INTO users
        if (upper.startsWith('INSERT INTO USERS')) {
            const [faculty_id, full_name, email, phone, department, role, password_hash] = params;
            const newUser = {
                id: ++nextUserId,
                faculty_id: String(faculty_id).trim().toUpperCase(),
                full_name: String(full_name).trim(),
                email: email || '',
                phone: phone || '',
                department: department || 'CSE',
                role: role || 'faculty',
                password_hash: password_hash || ''
            };
            TempDB.users.push(newUser);
            return { rows: [{ id: newUser.id }], rowCount: 1 };
        }

        // 3. SELECT branches
        if (upper.startsWith('SELECT') && upper.includes('FROM BRANCHES')) {
            return { rows: TempDB.branches.map(b => ({ ...b })) };
        }

        // 4. SELECT timetable for branch_id
        if (upper.startsWith('SELECT') && upper.includes('FROM TIMETABLE') && upper.includes('T.BRANCH_ID = $1')) {
            const branchId = parseInt(params[0]);
            const slots = TempDB.timetable.filter(t => t.branch_id === branchId);
            const enriched = slots.map(t => {
                const subj = TempDB.subjects.find(s => s.id === t.subject_id) || { subject_code: 'SUB', subject_name: 'Subject' };
                const user = TempDB.users.find(u => u.id === t.faculty_id) || { full_name: 'Assigned Faculty', phone: '1234567890' };
                return {
                    id: t.id,
                    day: t.day,
                    period: t.period,
                    start_time: t.start_time,
                    end_time: t.end_time,
                    room: t.room,
                    subject_code: subj.subject_code,
                    subject_name: subj.subject_name,
                    faculty_name: user.full_name,
                    faculty_id: t.faculty_id,
                    faculty_phone: user.phone
                };
            });
            return { rows: enriched };
        }

        // 5. INSERT INTO timetable
        if (upper.startsWith('INSERT INTO TIMETABLE')) {
            const [branch_id, day, period, start_time, end_time, subject_id, faculty_id, room] = params;
            const newSlot = {
                id: ++nextTimetableId,
                branch_id: parseInt(branch_id),
                day,
                period: parseInt(period),
                start_time,
                end_time,
                subject_id: parseInt(subject_id),
                faculty_id: parseInt(faculty_id),
                room
            };
            TempDB.timetable.push(newSlot);
            return { rows: [{ id: newSlot.id }], rowCount: 1 };
        }

        // 6. UPDATE timetable
        if (upper.startsWith('UPDATE TIMETABLE')) {
            const [subject_id, faculty_id, room, id] = params;
            const slot = TempDB.timetable.find(t => t.id === parseInt(id));
            if (slot) {
                if (subject_id) slot.subject_id = parseInt(subject_id);
                if (faculty_id) slot.faculty_id = parseInt(faculty_id);
                if (room) slot.room = room;
            }
            return { rowCount: slot ? 1 : 0 };
        }

        // 7. Check available faculty (Substitutions query)
        if (upper.includes('FROM USERS') && upper.includes('NOT IN')) {
            const day = params[0];
            const pNum = parseInt(params[1]);
            const date = params[2];

            const busyFacultyIds = new Set();
            // Busy in timetable
            TempDB.timetable.forEach(t => {
                if (t.day === day && parseInt(t.period) === pNum && t.faculty_id) {
                    busyFacultyIds.add(t.faculty_id);
                }
            });
            // Busy as substitute
            TempDB.substitutions.forEach(s => {
                if (s.date === date) {
                    const slot = TempDB.timetable.find(t => t.id === s.timetable_id);
                    if (slot && slot.period === pNum && s.substitute_faculty_id) {
                        busyFacultyIds.add(s.substitute_faculty_id);
                    }
                }
            });

            const freeFaculty = TempDB.users.filter(u => u.role === 'faculty' && !busyFacultyIds.has(u.id));
            return { rows: freeFaculty.map(u => ({ id: u.id, faculty_id: u.faculty_id, full_name: u.full_name, department: u.department })) };
        }

        // 8. Timetable single entry lookup
        if (upper.startsWith('SELECT DAY, PERIOD, FACULTY_ID FROM TIMETABLE WHERE ID = $1')) {
            const id = parseInt(params[0]);
            const entry = TempDB.timetable.find(t => t.id === id);
            return { rows: entry ? [{ ...entry }] : [] };
        }

        // 9. Timetable busy check
        if (upper.includes('FROM TIMETABLE WHERE FACULTY_ID = $1 AND DAY = $2 AND PERIOD = $3')) {
            const [fId, day, p] = params;
            const entry = TempDB.timetable.find(t => t.faculty_id === parseInt(fId) && t.day === day && t.period === parseInt(p));
            return { rows: entry ? [entry] : [] };
        }

        // 10. Substitutions busy check
        if (upper.includes('FROM SUBSTITUTIONS S') && upper.includes('WHERE S.SUBSTITUTE_FACULTY_ID = $1 AND S.DATE = $2')) {
            const [subFacId, date, p] = params;
            const entry = TempDB.substitutions.find(s => {
                if (s.substitute_faculty_id === parseInt(subFacId) && s.date === date) {
                    const slot = TempDB.timetable.find(t => t.id === s.timetable_id);
                    return slot && slot.period === parseInt(p);
                }
                return false;
            });
            return { rows: entry ? [entry] : [] };
        }

        // 11. INSERT INTO substitutions
        if (upper.startsWith('INSERT INTO SUBSTITUTIONS')) {
            const [timetable_id, date, original_faculty_id, substitute_faculty_id] = params;
            const newSub = {
                id: ++nextSubId,
                timetable_id: parseInt(timetable_id),
                date,
                original_faculty_id: parseInt(original_faculty_id),
                substitute_faculty_id: parseInt(substitute_faculty_id),
                status: 'assigned',
                created_at: new Date().toISOString()
            };
            TempDB.substitutions.push(newSub);
            return { rows: [{ id: newSub.id }], rowCount: 1 };
        }

        // 12. GET my duties (substitutions assigned to me)
        if (upper.includes('FROM SUBSTITUTIONS S') && upper.includes('WHERE S.SUBSTITUTE_FACULTY_ID = $1')) {
            const myId = parseInt(params[0]);
            const myDuties = TempDB.substitutions.filter(s => s.substitute_faculty_id === myId).map(s => {
                const t = TempDB.timetable.find(slot => slot.id === s.timetable_id) || {};
                const subj = TempDB.subjects.find(sb => sb.id === t.subject_id) || { subject_name: 'Subject' };
                const branch = TempDB.branches.find(b => b.id === t.branch_id) || { branch_name: 'CSE-A' };
                const orig = TempDB.users.find(u => u.id === s.original_faculty_id) || { full_name: 'Faculty' };
                return {
                    id: s.id,
                    status: s.status,
                    date: s.date,
                    day: t.day,
                    period: t.period,
                    start_time: t.start_time,
                    end_time: t.end_time,
                    room: t.room,
                    subject_name: subj.subject_name,
                    branch_name: branch.branch_name,
                    original_faculty_name: orig.full_name
                };
            });
            return { rows: myDuties };
        }

        // 13. GET my requests (substitutions requested by me)
        if (upper.includes('FROM SUBSTITUTIONS S') && upper.includes('WHERE S.ORIGINAL_FACULTY_ID = $1')) {
            const myId = parseInt(params[0]);
            const myRequests = TempDB.substitutions.filter(s => s.original_faculty_id === myId).map(s => {
                const t = TempDB.timetable.find(slot => slot.id === s.timetable_id) || {};
                const subj = TempDB.subjects.find(sb => sb.id === t.subject_id) || { subject_name: 'Subject' };
                const branch = TempDB.branches.find(b => b.id === t.branch_id) || { branch_name: 'CSE-A' };
                const subFac = TempDB.users.find(u => u.id === s.substitute_faculty_id) || { full_name: 'Substitute Faculty', faculty_id: 'FAC' };
                return {
                    id: s.id,
                    date: s.date,
                    status: s.status,
                    day: t.day,
                    period: t.period,
                    start_time: t.start_time,
                    end_time: t.end_time,
                    room: t.room,
                    subject_name: subj.subject_name,
                    branch_name: branch.branch_name,
                    substitute_faculty_name: subFac.full_name,
                    substitute_faculty_code: subFac.faculty_id
                };
            });
            return { rows: myRequests };
        }

        // 14. Substitution by ID
        if (upper.startsWith('SELECT SUBSTITUTE_FACULTY_ID FROM SUBSTITUTIONS WHERE ID = $1')) {
            const sub = TempDB.substitutions.find(s => s.id === parseInt(params[0]));
            return { rows: sub ? [sub] : [] };
        }

        // 15. UPDATE substitutions SET status = $1 WHERE id = $2
        if (upper.startsWith('UPDATE SUBSTITUTIONS SET STATUS')) {
            const [status, id] = params;
            const sub = TempDB.substitutions.find(s => s.id === parseInt(id));
            if (sub) sub.status = status;
            return { rowCount: sub ? 1 : 0 };
        }

        // 16. Detail lookup for timetable_id
        if (upper.includes('FROM TIMETABLE T') && upper.includes('WHERE T.ID = $1')) {
            const tId = parseInt(params[0]);
            const t = TempDB.timetable.find(slot => slot.id === tId);
            if (!t) return { rows: [] };
            const subj = TempDB.subjects.find(sb => sb.id === t.subject_id) || { subject_name: 'Subject', subject_code: 'SUB' };
            const user = TempDB.users.find(u => u.id === t.faculty_id) || { full_name: 'Faculty', phone: '1234567890', id: t.faculty_id };
            return {
                rows: [{
                    id: t.id,
                    day: t.day,
                    period: t.period,
                    start_time: t.start_time,
                    end_time: t.end_time,
                    room: t.room,
                    subject_name: subj.subject_name,
                    subject_code: subj.subject_code,
                    faculty_name: user.full_name,
                    faculty_phone: user.phone,
                    faculty_id: user.id
                }]
            };
        }

        // 17. Substitution lookup for slot + date
        if (upper.includes('FROM SUBSTITUTIONS SUB') && upper.includes('WHERE SUB.TIMETABLE_ID = $1 AND SUB.DATE = $2')) {
            const [tId, date] = params;
            const sub = TempDB.substitutions.find(s => s.timetable_id === parseInt(tId) && s.date === date);
            if (!sub) return { rows: [] };
            const subFac = TempDB.users.find(u => u.id === sub.substitute_faculty_id) || { full_name: 'Substitute', phone: '9876543210', department: 'CSE' };
            return {
                rows: [{
                    id: sub.id,
                    status: sub.status,
                    date: sub.date,
                    substitute_name: subFac.full_name,
                    substitute_phone: subFac.phone,
                    substitute_dept: subFac.department
                }]
            };
        }

        return { rows: [] };
    }
};

console.log('⚡ Using In-Memory Temporary Database (Ready & Seeded)');

module.exports = db;
