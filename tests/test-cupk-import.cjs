'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const adapter = require('../src/assets/cupk-import.js');
let checks = 0;
function check(name, action) { action(); checks++; console.log('PASS ' + name); }
const units = [
  { indexNo: 1, startTime: 900, endTime: 945 },
  { indexNo: 2, startTime: 950, endTime: 1035 },
  { indexNo: 3, startTime: 1045, endTime: 1130 },
  { indexNo: 4, startTime: 1135, endTime: 1220 }
];
// Synthetic fixtures based on documented EAMS5 field names; no actual student data.
const lesson = { id: 17, courseName: 'fixture-only', teacherAssignmentList: [{ name: 'teacher-fixture' }] };
const slot = { lessonId: 17, weekday: 1, weekIndex: 1, startTime: 900, endTime: 1035, periods: 2, room: { nameZh: 'room-fixture' } };
function convert(slots, moreLessons = []) { return adapter.convertDatum({ result: { lessonList: [lesson, ...moreLessons], scheduleList: slots } }, units); }
check('single and odd/even weeks', () => {
  assert.deepEqual(adapter.parseWeeks('1-8周(单)'), [1, 3, 5, 7]);
  assert.deepEqual(adapter.parseWeeks('2-10周（双）'), [2, 4, 6, 8, 10]);
  assert.deepEqual(adapter.parseWeeks('1-8周(单),10-16周(双)'), [1, 3, 5, 7, 10, 12, 14, 16]);
  assert.deepEqual(adapter.parseWeeks('第1、3、5周'), [1, 3, 5]);
  assert.deepEqual(adapter.parseWeeks('1-16周单双'), []);
  assert.deepEqual(adapter.parseWeeks([0, 1, 2, 2, 61, '3foo']), [1, 2]);
  assert.deepEqual(adapter.parseWeeks('暂无数据'), []);
});
check('clock/section conversion requires exact known boundaries', () => {
  const normalized = adapter.normalizeUnits(units);
  assert.deepEqual(adapter.sections(slot, normalized), { start: 1, end: 2 });
  assert.equal(adapter.sections({ startTime: 910, endTime: 1035 }, normalized), null);
  assert.equal(adapter.sections({ startTime: 900, endTime: 1065 }, normalized), null);
  assert.equal(adapter.sections({ startSection: 14, endSection: 15 }, normalized), null);
  assert.deepEqual(adapter.sections({ startSection: 13, endSection: 14 }, []), { start: 13, end: 14 });
});
check('verified school clock table requires continuous complete unit numbering', () => {
  assert.deepEqual(adapter.verifiedTimes(units), [{start:'09:00',end:'09:45'},{start:'09:50',end:'10:35'},{start:'10:45',end:'11:30'},{start:'11:35',end:'12:20'}]);
  assert.deepEqual(adapter.verifiedTimes(units.slice(1)), []);
  assert.deepEqual(adapter.verifiedTimes([units[0], units[0]]), []);
  assert.deepEqual(adapter.verifiedTimes([...units, {indexNo:5,startTime:1265,endTime:1400}]), []);
  assert.deepEqual(adapter.verifiedTimes([{indexNo:1,startTime:900,endTime:1030},{indexNo:2,startTime:1000,endTime:1100}]), []);
});
check('datum mapping and week merge preserves output contract', () => {
  const result = convert([slot, { ...slot, weekIndex: 3 }, { ...slot, weekIndex: 5 }, { ...slot, weekIndex: 3 }]);
  assert.equal(result.courses.length, 1);
  const c = result.courses[0];
  assert.deepEqual(c.weeks, [1, 3, 5]);
  assert.deepEqual([c.name, c.teacher, c.room, c.day, c.start, c.end], ['fixture-only', 'teacher-fixture', 'room-fixture', 1, 1, 2]);
  assert.equal(typeof c.id, 'string'); assert.ok(c.color >= 0 && c.color <= 7);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.times.length, 4);
});
check('reject invalid weekdays and weeks; zero based mapping is not guessed', () => {
  const result = convert([{ ...slot, weekday: 0 }, { ...slot, weekday: 8 }, { ...slot, weekIndex: 0 }, { ...slot, weekday: 7, weekIndex: 2 }]);
  assert.equal(result.courses.length, 1); assert.equal(result.courses[0].day, 7);
  assert.match(result.warnings[0], /3 条/);
});
check('preserve different teachers rooms time ranges and lesson identities', () => {
  const result = convert([slot, { ...slot, personName: 'other-teacher' }, { ...slot, room: { nameZh: 'other-room' } }, { ...slot, startTime: 1045, endTime: 1220 }, { ...slot, lessonId: 18 }], [{ ...lesson, id: 18 }]);
  assert.equal(result.courses.length, 5); assert.equal(new Set(result.courses.map(c => c.id)).size, 5);
});
check('unpublished lessons excluded', () => {
  assert.equal(adapter.convertDatum({ result: { lessonList: [lesson], scheduleList: [slot] } }, units, { 17: 'draft' }).courses.length, 0);
});
check('empty data and task IDs never generate sample courses', () => {
  assert.deepEqual(convert([]).courses, []);
  assert.deepEqual(adapter.convertDatum({ lessonIds: [17], timeTableLayoutId: 1 }, units).courses, []);
  assert.deepEqual(adapter.convertDatum('<html>login</html>', units).courses, []);
});
check('DOM fallback requires explicit weeks and labels', () => {
  assert.deepEqual(adapter.parseCell('fixture-only\n教师：T\n教室：R\n第1-8周（单）', 2, 3, 4), { name: 'fixture-only', teacher: 'T', room: 'R', day: 2, start: 3, end: 4, weeks: [1, 3, 5, 7] });
  assert.equal(adapter.parseCell('fixture-only\n教师：T', 2, 3, 4), null);
  assert.equal(adapter.parseCell('fixture-only\n1-8周', 0, 3, 4), null);
});
async function bridgeTest() {
  const context = { location: { origin: 'https://example.invalid' }, Promise, Set, URL, Date, Math, JSON, Number, Array, Object, String, globalThis: null };
  context.window = context; vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../src/assets/cupk-import.js'), 'utf8'), context);
  const json = await context.QingImport.run();
  assert.equal(context.__qingImport.status, 'error'); assert.match(JSON.parse(json).error, /教务系统/);
  checks++; console.log('PASS async bridge stores final error without unhandled Promise');
  const requests = [];
  const doc = { documentElement: { outerHTML: '<script>var studentId = 55; var semesterId = 66; var bizTypeId = 2;</script>' }, querySelector: () => null, querySelectorAll: () => [] };
  const browser = { location: { origin: 'https://eams.cupk.edu.cn', href: 'https://eams.cupk.edu.cn/student/for-std/course-table/info/55' }, document: doc,
    DOMParser: class { parseFromString() { return { ...doc }; } }, AbortController, setTimeout, clearTimeout, Promise, Set, URL, Date, Math, JSON, Number, Array, Object, String };
  browser.window = browser;
  browser.fetch = async (url, options) => {
    requests.push({ url, options });
    const data = url.includes('get-data') ? { lessonIds: [17], timeTableLayoutId: 1, lessonId2Flag: { 17: 'publish' } } : url.includes('timetable-layout') ? { result: { courseUnitList: units } } : { result: { lessonList: [lesson], scheduleList: [slot, { ...slot, weekIndex: 2 }] } };
    return { ok: true, status: 200, url, text: async () => JSON.stringify(data) };
  };
  vm.createContext(browser); vm.runInContext(fs.readFileSync(require.resolve('../src/assets/cupk-import.js'), 'utf8'), browser);
  const success = JSON.parse(await browser.QingImport.run());
  assert.equal(browser.__qingImport.status, 'done'); assert.deepEqual(success.courses[0].weeks, [1, 2]);
  assert.deepEqual(requests.map(r => r.options.method), ['GET', 'POST', 'POST']);
  assert.ok(requests.every(r => r.url.startsWith('https://eams.cupk.edu.cn/student/') && r.options.credentials === 'same-origin'));
  assert.deepEqual(JSON.parse(requests[2].options.body), { lessonIds: [17], studentId: 55, weekIndex: '' });
  checks++; console.log('PASS complete mocked query flow, request contract and bridge result');
  browser.fetch = async url => ({ ok: true, status: 200, url: 'https://eams.cupk.edu.cn/student/login', text: async () => '<title>登入页面</title>' });
  const expired = JSON.parse(await browser.QingImport.run()); assert.equal(browser.__qingImport.status, 'error'); assert.match(expired.error, /登录/);
  checks++; console.log('PASS login redirect never produces courses');
  console.log('RESULT: ' + checks + ' meaningful checks passed; synthetic fixtures only.');
}
bridgeTest().catch(e => { console.error(e); process.exitCode = 1; });
