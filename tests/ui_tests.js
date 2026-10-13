'use strict';
const assert = require('assert');
const C = require('../src/assets/core.js');
let tests = 0;
function test(name, fn) { fn(); tests++; console.log('PASS ' + name); }
test('Chinese week ranges, parity, unique ordering', () => {
  assert.deepStrictEqual(C.parseWeeks('第1–8周（单）'),[1,3,5,7]);
  assert.deepStrictEqual(C.parseWeeks('2，4、6-10（双）'),[2,4,6,8,10]);
  assert.deepStrictEqual(C.parseWeeks([3,1,3]),[1,3]);
  assert.strictEqual(C.weekText([1,2,3,5,7,8]),'1-3,5,7-8');
});
test('invalid weeks cannot silently become full-semester courses', () => {
  ['', '0-3','5-2','1-31','1,abc','1-4单双'].forEach(v => assert.throws(() => C.parseWeeks(v)));
  assert.throws(() => C.parseWeeks([1,1.5]));
  assert.throws(() => C.parseWeeks('1-21',20));
});
test('course boundaries validated before saves', () => {
  let c = {name:'数学',day:1,start:1,end:2,weeks:[1,3],color:2};
  assert.strictEqual(C.normalizeCourse(c).room,'');
  ['day','start','end'].forEach(k => assert.throws(() => C.normalizeCourse({...c,[k]:0})));
  assert.throws(() => C.normalizeCourse({...c,end:15}));
  assert.throws(() => C.normalizeCourse({...c,start:4,end:2}));
  assert.throws(() => C.normalizeCourse({...c,name:''}));
});
test('only shared days, times and weeks create conflicts', () => {
  let a = C.normalizeCourse({name:'A',day:1,start:1,end:2,weeks:[1,3]});
  let b = C.normalizeCourse({name:'B',day:1,start:2,end:3,weeks:[3]});
  assert(C.conflicts(a,b));
  assert(!C.conflicts(a,{...b,weeks:[2]}));
  assert(!C.conflicts(a,{...b,day:2}));
  assert(!C.conflicts(a,{...b,start:3}));
  assert.strictEqual(C.conflictPairs([a,b]).length,1);
});
test('current week is date based including pre-term and rollover', () => {
  assert.strictEqual(C.currentWeek('', '2026-10-13'),null);
  assert.strictEqual(C.currentWeek('2026-10-12','2026-10-11'),0);
  assert.strictEqual(C.currentWeek('2026-10-12','2026-10-18'),1);
  assert.strictEqual(C.currentWeek('2026-10-12','2026-10-19'),2);
  assert.strictEqual(C.addDays('2026-12-28',7),'2027-01-04');
  assert.strictEqual(C.dateValue('2026-02-30'),null);
});
test('settings require a Monday and ordered nonoverlapping periods', () => {
  let d = C.defaults().settings;
  assert.strictEqual(C.normalizeSettings(d).startDate,'');
  assert.throws(() => C.normalizeSettings({...d,startDate:'2026-10-13'}));
  let times = JSON.parse(JSON.stringify(d.times));times[1].start = '08:30';
  assert.throws(() => C.normalizeSettings({...d,times}));
  assert.throws(() => C.normalizeSettings({...d,weeks:31}));
});
test('ICS emits exactly each selected week with times, escaped text and reminders', () => {
  let d = C.defaults();d.settings.startDate = '2026-10-12';d.settings.timeSource='manual';
  d.courses = [C.normalizeCourse({id:'test',name:'数学, A;B\nC',teacher:'王老师',room:'A203',day:2,start:1,end:2,weeks:[1,3]})];
  let out = C.calendar(d);
  assert.strictEqual((out.match(/BEGIN:VEVENT/g)||[]).length,2);
  assert(out.includes('DTSTART:20261013T080000'));
  assert(out.includes('DTEND:20261013T094000'));
  assert(out.includes('DTSTART:20261027T080000'));
  assert(out.includes('SUMMARY:数学\\, A\\;B\\nC'));
  assert(out.includes('TRIGGER:-PT10M'));
  assert(!C.calendar({...d,settings:{...d.settings,reminder:0}}).includes('VALARM'));
  d.courses[0].name = '中文'.repeat(60);
  C.calendar(d).split('\r\n').forEach(line => assert(Buffer.byteLength(line,'utf8') <= 75));
  assert.throws(() => C.calendar(C.defaults()));
});
test('state backup round-trip and invalid input rejection', () => {
  let d = C.defaults();d.tasks = [{name:'数学作业',date:'2026-10-13',type:'作业',done:true}];
  let normalized = C.normalizeState(d);
  assert.deepStrictEqual(C.normalizeState(JSON.parse(JSON.stringify(normalized))),normalized);
  assert.throws(() => C.normalizeState({courses:[],tasks:[{name:'x',date:'invalid'}]}));
  assert.throws(() => C.normalizeState({...normalized,tasks:[normalized.tasks[0],normalized.tasks[0]]}));
});
test('reminder bounds include off, one minute and two hours', () => {
  const d = C.defaults().settings;
  [0,1,10,120].forEach(reminder => assert.strictEqual(C.normalizeSettings({...d,reminder}).reminder,reminder));
  [-1,121,1.5].forEach(reminder => assert.throws(() => C.normalizeSettings({...d,reminder})));
});
test('school time length, unresolved records and unknown clocks survive round trip',()=>{
 let d=C.defaults();d.settings.startDate='2026-08-31';d.settings.times=d.settings.times.slice(0,12);
 assert.strictEqual(C.currentWeek(d.settings.startDate,'2026-10-13'),7);
 d.importIssues=[{name:'待排课程',reason:'无固定时间'}];
 assert.strictEqual(C.normalizeState(d).importIssues[0].name,'待排课程');
 assert.strictEqual(C.normalizeSettings(d.settings).times.length,12);
 assert.throws(()=>C.calendar(d),/作息尚未确认/);
 d.courses=[{name:'越界课程',day:1,start:13,end:14,weeks:[1]}];
 assert.throws(()=>C.normalizeState(d),/作息只有12节/);
});
console.log(tests + ' meaningful core test groups passed.');
