(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QingCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function pad(n) { return String(n).padStart(2, '0'); }
  function dateValue(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
    var d = new Date(s + 'T12:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === s ? d : null;
  }
  function addDays(s, n) { var d = dateValue(s); if (!d) return ''; d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function currentWeek(start, now) { var a = dateValue(start), b = dateValue(now || today()); return a && b ? Math.floor((b - a) / 604800000) + 1 : null; }
  function parseWeeks(value, max) {
    max = max || 30;
    if (Array.isArray(value)) {
      if (!value.length || value.some(function (w) { return !Number.isInteger(w) || w < 1 || w > max; })) throw new Error('周次须为 1–' + max + ' 的整数');
      return Array.from(new Set(value)).sort(function (a, b) { return a - b; });
    }
    var s = String(value || '').trim().replace(/[，、；;]/g, ',').replace(/[~～—–至]/g, '-').replace(/第|周|\s/g, '');
    var parity = /单/.test(s) ? 1 : /双/.test(s) ? 0 : null;
    if (/单/.test(s) && /双/.test(s)) throw new Error('单双周只能选择一种');
    s = s.replace(/[单双()（）]/g, '');
    if (!s) throw new Error('请填写周次，例如 1-16 或 1-16(单)');
    var weeks = [];
    s.split(',').forEach(function (part) {
      var m = /^(\d+)(?:-(\d+))?$/.exec(part);
      if (!m) throw new Error('无法识别周次：' + part);
      var lo = +m[1], hi = m[2] ? +m[2] : lo;
      if (lo < 1 || hi > max || lo > hi) throw new Error('周次范围须为 1–' + max);
      for (var w = lo; w <= hi; w++) if (parity === null || w % 2 === parity) weeks.push(w);
    });
    if (!weeks.length) throw new Error('周次没有可用的上课周');
    return Array.from(new Set(weeks)).sort(function (a, b) { return a - b; });
  }
  function weekText(weeks) {
    var out = [], start = weeks[0], previous = start;
    weeks.slice(1).concat([null]).forEach(function (w) {
      if (w === previous + 1) previous = w;
      else { out.push(start === previous ? String(start) : start + '-' + previous); start = previous = w; }
    });
    return out.join(',');
  }
  function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 200); }
  function int(v, lo, hi, label) { var n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(label + '须为 ' + lo + '–' + hi + ' 的整数'); return n; }
  function uid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
  function normalizeCourse(c, max) {
    if (!c || typeof c !== 'object') throw new Error('课程格式错误');
    var name = str(c.name, 120); if (!name) throw new Error('请填写课程名称');
    var start = int(c.start, 1, 14, '开始节次'), end = int(c.end, 1, 14, '结束节次');
    if (end < start) throw new Error('结束节次不能早于开始节次');
    return { id: str(c.id, 120) || uid(), name: name, teacher: str(c.teacher, 120), room: str(c.room, 160), day: int(c.day, 1, 7, '星期'), start: start, end: end, weeks: parseWeeks(c.weeks, max || 30), color: c.color === undefined ? 0 : int(c.color, 0, 7, '颜色') };
  }
  function conflicts(a, b) { return a.day === b.day && a.start <= b.end && b.start <= a.end && a.weeks.some(function (w) { return b.weeks.indexOf(w) !== -1; }); }
  function conflictPairs(courses) {
    var result = []; courses.forEach(function (a, i) { courses.slice(i + 1).forEach(function (b) { if (conflicts(a, b)) result.push([a.id, b.id]); }); }); return result;
  }
  function defaultTimes() {
    return ['08:00','08:55','10:10','11:05','12:00','13:00','14:00','14:55','16:10','17:05','18:00','19:00','19:55','20:50'].map(function (s) {
      var n = +s.slice(0, 2) * 60 + +s.slice(3) + 45; return { start: s, end: pad(Math.floor(n / 60)) + ':' + pad(n % 60) };
    });
  }
  function defaults() { return { courses: [], tasks: [], importIssues: [], settings: { semester: '我的课表', startDate: '', weeks: 20, times: defaultTimes(), timeSource:'unverified', reminder: 10, theme: 'mint' } }; }
  function minutes(t) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t || '')) throw new Error('时间格式应为 HH:MM'); return +t.slice(0,2) * 60 + +t.slice(3); }
  function normalizeSettings(s) {
    s = Object.assign({}, defaults().settings, s || {});
    if (s.startDate && (!dateValue(s.startDate) || dateValue(s.startDate).getUTCDay() !== 1)) throw new Error('开学日期应为有效的周一');
    var times = s.times;
    if (!Array.isArray(times) || !times.length || times.length > 14) throw new Error('每日节数应为 1–14 节');
    var previous = -1;
    times = times.map(function (t) { var a = minutes(t.start), b = minutes(t.end); if (b <= a || a < previous) throw new Error('节次时间须按顺序且不重叠'); previous = b; return { start: t.start, end: t.end }; });
    return { semester: str(s.semester, 80) || '我的课表', startDate: s.startDate || '', weeks: int(s.weeks, 1, 30, '学期周数'), times: times, timeSource:['school','manual'].indexOf(s.timeSource)>=0?s.timeSource:'unverified', reminder: int(s.reminder, 0, 120, '提醒分钟'), theme: ['mint','blue','violet'].indexOf(s.theme) >= 0 ? s.theme : 'mint' };
  }
  function normalizeTask(t) {
    if (!t || !str(t.name, 160)) throw new Error('请填写待办标题');
    if (!dateValue(t.date)) throw new Error('请选择待办日期');
    return { id: str(t.id, 120) || uid(), name: str(t.name, 160), type: ['作业','考试','事件'].indexOf(t.type) >= 0 ? t.type : '作业', date: t.date, note: str(t.note, 500), done: !!t.done };
  }
  function normalizeState(state) {
    if (!state || !Array.isArray(state.courses) || !Array.isArray(state.tasks)) throw new Error('备份格式错误');
    var settings = normalizeSettings(state.settings);
    var courses = state.courses.map(function (c) { return normalizeCourse(c, settings.weeks); }), tasks = state.tasks.map(normalizeTask);
    var outside=courses.find(function(c){return c.end>settings.times.length;});
    if(outside)throw new Error('“'+outside.name+'”使用第'+outside.end+'节，但作息只有'+settings.times.length+'节；请补齐作息或更正课程节次');
    if (new Set(courses.map(function (c) {return c.id;})).size !== courses.length || new Set(tasks.map(function (t) {return t.id;})).size !== tasks.length) throw new Error('数据中有重复编号，请修复备份后重试');
    var issues=(Array.isArray(state.importIssues)?state.importIssues:[]).map(function(x){return {name:str(x.name,120)||'未命名课程',reason:str(x.reason,400),details:str(x.details,600)};});
    return { settings: settings, courses: courses, tasks: tasks, importIssues:issues };
  }
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
  function calendar(state) {
    state = normalizeState(state); if (!state.settings.startDate) throw new Error('请先在设置中填写开学日期');
    if(state.settings.timeSource==='unverified')throw new Error('学校作息尚未确认，请先核对时间再导出日历');
    var lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Qing//Timetable//CN','CALSCALE:GREGORIAN','X-WR-CALNAME:' + icsEscape(state.settings.semester)];
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    state.courses.forEach(function (c) { c.weeks.forEach(function (w) {
      var day = addDays(state.settings.startDate, (w - 1) * 7 + c.day - 1).replace(/-/g, '');
      lines.push('BEGIN:VEVENT','UID:' + icsEscape(c.id) + '-' + w + '@qing.local','DTSTAMP:' + stamp,'DTSTART:' + day + 'T' + state.settings.times[c.start - 1].start.replace(':','') + '00','DTEND:' + day + 'T' + state.settings.times[c.end - 1].end.replace(':','') + '00','SUMMARY:' + icsEscape(c.name),'LOCATION:' + icsEscape(c.room),'DESCRIPTION:' + icsEscape(c.teacher + ' 第' + w + '周 · 第' + c.start + '-' + c.end + '节'));
      if (state.settings.reminder > 0) lines.push('BEGIN:VALARM','TRIGGER:-PT' + state.settings.reminder + 'M','ACTION:DISPLAY','DESCRIPTION:' + icsEscape(c.name),'END:VALARM');
      lines.push('END:VEVENT');
    }); });
    lines.push('END:VCALENDAR');
    // RFC 5545 physical lines are limited to 75 UTF-8 octets.
    return lines.map(function (line) {
      var chunks = [], segment = '', bytes = 0;
      Array.from(line).forEach(function (ch) { var size = encodeURIComponent(ch).replace(/%[A-F\d]{2}|./g, 'x').length; if (bytes + size > 73) { chunks.push(segment); segment = ' '; bytes = 1; } segment += ch; bytes += size; });
      chunks.push(segment); return chunks.join('\r\n');
    }).join('\r\n') + '\r\n';
  }
  return { pad: pad, today: today, dateValue: dateValue, addDays: addDays, currentWeek: currentWeek, parseWeeks: parseWeeks, weekText: weekText, normalizeCourse: normalizeCourse, conflicts: conflicts, conflictPairs: conflictPairs, defaults: defaults, normalizeSettings: normalizeSettings, normalizeTask: normalizeTask, normalizeState: normalizeState, calendar: calendar, uid: uid };
});
