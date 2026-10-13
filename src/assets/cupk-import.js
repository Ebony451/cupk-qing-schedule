/* Qing timetable: original EAMS5 adapter. No credentials are read or transmitted.
 * Browser: QingImport.run(); poll __qingImport.status. Node: module.exports.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QingImport = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var ORIGIN = 'https://eams.cupk.edu.cn', CTX = '/student';
  function text(v) { return v == null ? '' : String(v).trim(); }
  function integer(v, min, max) {
    if (typeof v !== 'number' && !/^\d+$/.test(text(v))) return null;
    var n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : null;
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  function unique(a) { return Array.from(new Set(a)).sort(function (a, b) { return a - b; }); }
  function weeks(value) {
    if (Array.isArray(value)) return unique(value.map(function (v) { return integer(v, 1, 60); }).filter(Boolean));
    if (typeof value === 'number') return integer(value, 1, 60) ? [value] : [];
    var s = text(value).replace(/[，、；;]/g, ',').replace(/[—–~～至]/g, '-').replace(/第/g, '').replace(/\s+/g, '');
    if (!s || /[^0-9,\-周单双()（）]/.test(s)) return [];
    var all = [], blocks = s.replace(/([)）])/g, '$1|').split('|');
    blocks.forEach(function (block) {
      if (!block) return;
      var parity = /单/.test(block) ? 1 : /双/.test(block) ? 0 : null;
      if (/单/.test(block) && /双/.test(block)) return;
      var numeric = block.replace(/[周单双()（）]/g, '');
      numeric.split(',').forEach(function (part) {
        if (!part) return;
        var m = part.match(/^(\d+)(?:-(\d+))?$/); if (!m) return;
        var a = integer(m[1], 1, 60), b = integer(m[2] || m[1], 1, 60);
        if (a == null || b == null || b < a) return;
        for (var w = a; w <= b; w++) if (parity == null || w % 2 === parity) all.push(w);
      });
    });
    return unique(all);
  }
  function minutes(value) {
    var s = text(value), m = s.match(/^(\d{1,2}):(\d{2})(?::00)?$/), h, n;
    if (m) { h = Number(m[1]); n = Number(m[2]); }
    else { var v = integer(value, 0, 2359); if (v == null) return null; h = Math.floor(v / 100); n = v % 100; }
    return h <= 23 && n <= 59 ? h * 60 + n : null;
  }
  function normalizeUnits(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(function (u) {
      var index = integer(u && (u.indexNo != null ? u.indexNo : u.index), 1, 14);
      var start = minutes(u && u.startTime), end = minutes(u && u.endTime);
      return index != null && start != null && end > start ? { index: index, start: start, end: end } : null;
    }).filter(Boolean).sort(function (a, b) { return a.index - b.index; });
  }
  function verifiedTimes(raw) {
    var units = normalizeUnits(raw);
    if (!Array.isArray(raw) || !units.length || units.length !== raw.length) return [];
    for (var i = 0; i < units.length; i++) {
      if (units[i].index !== i + 1 || i > 0 && units[i].start < units[i - 1].end) return [];
    }
    function clock(n) { return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); }
    return units.map(function (u) { return { start: clock(u.start), end: clock(u.end) }; });
  }
  function sections(slot, units) {
    if (slot.startSection != null || slot.endSection != null) {
      var a = integer(slot.startSection, 1, 14), b = integer(slot.endSection, 1, 14);
      return a != null && b != null && a <= b ? { start: a, end: b } : null;
    }
    var start = minutes(slot.startTime), end = minutes(slot.endTime);
    if (start == null || end == null || end <= start) return null;
    var matched = units.filter(function (u) { return u.start < end && u.end > start; });
    if (!matched.length || matched[0].start !== start || matched[matched.length - 1].end !== end) return null;
    for (var i = 1; i < matched.length; i++) if (matched[i].index !== matched[i - 1].index + 1) return null;
    return { start: matched[0].index, end: matched[matched.length - 1].index };
  }
  function teachers(lesson) {
    return Array.from(new Set((lesson.teacherAssignmentList || []).map(function (t) { return text(t.name); }).filter(Boolean))).join('、');
  }
  function merge(records) {
    var map = Object.create(null);
    records.forEach(function (c) {
      var key = JSON.stringify([c.lessonKey || c.name, c.name, c.teacher, c.room, c.day, c.start, c.end]);
      if (map[key]) map[key].weeks = unique(map[key].weeks.concat(c.weeks));
      else map[key] = { id: 'cupk-' + hash(key).toString(16), name: c.name, teacher: c.teacher, room: c.room, day: c.day, start: c.start, end: c.end, weeks: c.weeks.slice(), color: hash(c.lessonKey || c.name) % 8 };
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return a.day - b.day || a.start - b.start || a.name.localeCompare(b.name); });
  }
  function convertDatum(payload, rawUnits, flags) {
    var result = payload && payload.result != null ? payload.result : payload;
    var output = { courses: [], warnings: [], unresolved: [], source: 'CUPK 教务系统 EAMS5', semester: '' };
    if (!result || !Array.isArray(result.lessonList) || !Array.isArray(result.scheduleList)) {
      output.warnings.push('排课响应缺少 lessonList 或 scheduleList，已拒绝解析。'); return output;
    }
    var lessonMap = Object.create(null), units = normalizeUnits(rawUnits), records = [], skipped = 0, scheduled = new Set();
    result.lessonList.forEach(function (l) { if (l && l.id != null) lessonMap[text(l.id)] = l; });
    result.scheduleList.forEach(function (slot) {
      if (!slot) { skipped++; return; }
      scheduled.add(text(slot.lessonId));
      var lesson = lessonMap[text(slot.lessonId)], name = text(lesson && (lesson.courseName || lesson.course && (lesson.course.nameZh || lesson.course.name)));
      if (flags && /^(draft|unpublish|unpublished)$/i.test(text(flags[slot.lessonId]))) { skipped++;output.unresolved.push({name:name||'未命名课程',reason:'教务接口标记为未发布，未放入周课表'});return; }
      var day = integer(slot.weekday, 1, 7), section = sections(slot, units);
      var ws = weeks(slot.weekIndexes != null ? slot.weekIndexes : slot.weekIndex);
      if (!name || day == null || !section || !ws.length) { skipped++;output.unresolved.push({name:name||'未命名课程',reason:[!name?'缺少课程名称':'',day==null?'星期无法确认':'',!section?'节次与学校作息无法对应':'',!ws.length?'缺少明确上课周次':''].filter(Boolean).join('；'),details:'星期 '+text(slot.weekday)+'；时间 '+text(slot.startTime)+'–'+text(slot.endTime)+'；周次 '+text(slot.weekIndexes!=null?slot.weekIndexes:slot.weekIndex)});return; }
      var room = text(slot.room && (slot.room.nameZh || slot.room.name)) || text(slot.customPlace);
      records.push({ lessonKey: text(slot.lessonId), name: name, teacher: text(slot.personName) || teachers(lesson), room: room, day: day, start: section.start, end: section.end, weeks: ws });
    });
    output.courses = merge(records);
    result.lessonList.forEach(function(l){if(l&&!scheduled.has(text(l.id)))output.unresolved.push({name:text(l.courseName)||'未命名课程',reason:'课程列表有此课程，但未返回固定排课时间'});});
    var times = verifiedTimes(rawUnits);
    if (times.length) output.times = times;
    if (skipped) output.warnings.push('有 ' + skipped + ' 条排课缺少可验证的课程、周次、星期、节次或未发布，已跳过。');
    if (!result.scheduleList.length) output.warnings.push('该学期未返回已排课程；慕课、实践等无固定上课时间课程不会进入周课表。');
    return output;
  }
  function hidden(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.hidden || el.style && el.style.display === 'none') return true;
    var view=el.ownerDocument && el.ownerDocument.defaultView;
    if(view && view.getComputedStyle && el.isConnected && view.getComputedStyle(el).display==='none')return true;
    return !view && /(?:^|\s)(?:hide|hidden|d-none)(?:\s|$)/.test(text(el.className));
  }
  function readableCell(cell) {
    if(!cell.childNodes)return text(cell.innerText||cell.textContent);
    function walk(node){
      if(node.nodeType===3)return node.nodeValue||'';
      if(node.nodeType!==1||hidden(node)||/^(SCRIPT|STYLE|INPUT|SELECT|BUTTON)$/.test(node.tagName))return '';
      if(node.tagName==='BR'||node.tagName==='HR')return '\n';
      var bold=/^(B|STRONG)$/.test(node.tagName)||/(?:^|\s)(?:course-name|courseName)(?:\s|$)/.test(text(node.className));
      var title=text(node.textContent),heading=bold&&title.length<120&&!/周|节|教师|老师|教室|学分/.test(title)&&!/^\d/.test(title);
      var block=/^(DIV|P|LI|H[1-6])$/.test(node.tagName)||heading;
      return (heading?'\n\u001e':block?'\n':'')+Array.from(node.childNodes).map(walk).join('')+(block?'\n':'');
    }
    return walk(cell);
  }
  function cellRecords(raw,day,start,end) {
    var records=[],unresolved=[];
    // Bold headings are marked by readableCell. Plain copies use explicit labels or course-code lines.
    var input=text(raw).replace(/\r/g,''),chunks=input.split('\u001e').filter(function(s){return text(s);});
    if(chunks.length<=1){
      var lines=input.split('\n'),starts=[];
      lines.forEach(function(line,i){if(/^(?:课程名称|课程)\s*[：:]/.test(text(line))||i+1<lines.length&&/^(?=.*\d)[A-Za-z0-9]{6,}(?:\.\d+)?$/.test(text(lines[i+1]))&&!/^\d/.test(text(line)))starts.push(i);});
      if(starts.length>1)chunks=starts.map(function(n,i){return lines.slice(n,starts[i+1]||lines.length).join('\n');});
    }
    chunks.forEach(function(chunk){
      var lines=chunk.split(/\n+/).map(text).filter(Boolean),nm=chunk.match(/(?:课程名称|课程)\s*[：:]\s*([^\n]+)/);
      var name=nm?text(nm[1]):lines.find(function(l){return !/周|节|教师|老师|教室|地点|学分|学时/.test(l)&&!/^\d/.test(l);});
      if(!name)return;
      var re=/(\d[\d\s,，、\-—–~～至]*?)\s*([单双])?周(?:\s*[（(]\s*([单双])(?:周)?\s*[）)])?/g,match,matches=[];
      while((match=re.exec(chunk)))matches.push({index:match.index,end:re.lastIndex,weeks:weeks(match[1]+(match[2]||match[3]?'('+ (match[2]||match[3])+')':''))});
      if(!matches.length){unresolved.push({name:name,reason:'未找到明确上课周次'});return;}
      var globalTeacher=chunk.match(/(?:教师|老师)\s*[：:]\s*([^\n]+)/),globalRoom=chunk.match(/(?:教室|地点)\s*[：:]\s*([^\n]+)/);
      matches.forEach(function(m,i){
        var segment=chunk.slice(m.end,i+1<matches.length?matches[i+1].index:chunk.length);
        var sec=segment.match(/(?:第)?(\d{1,2})(?:\s*[-~～至—–]\s*(\d{1,2}))?\s*节/),a=sec?Number(sec[1]):start,b=sec?Number(sec[2]||sec[1]):end;
        if(!m.weeks.length||integer(day,1,7)==null||integer(a,1,14)==null||integer(b,a,14)==null){unresolved.push({name:name,reason:'星期、节次或上课周次无法确认'});return;}
        var room=globalRoom?text(globalRoom[1]):'',teacher=globalTeacher?text(globalTeacher[1]):'';
        // EAMS text often has "(1-2节) C4楼515 教师(编号)" without field labels.
        if(sec){var tail=segment.slice(sec.index+sec[0].length).replace(/^[)）\s]+/,'').trim();var tm=tail.match(/^([^\n]*?)\s+([^\s()（）]{2,20})\s*[（(]\d{5,}[）)]/);if(tm){if(!room)room=text(tm[1]);if(!teacher)teacher=text(tm[2]);}}
        records.push({name:name,teacher:teacher,room:room,day:day,start:a,end:b,weeks:m.weeks});
      });
    });
    return {records:records,unresolved:unresolved};
  }
  function parseCell(raw,day,start,end){return cellRecords(raw,day,start,end).records[0]||null;}
  function semesterStart(doc){
    var body=doc.body||doc.documentElement,content=body?text(body.innerText||body.textContent):'';
    var m=content.match(/学期(?:起始|开始)日期\s*[：:]?\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if(!m)return '';var s=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'),d=new Date(s+'T12:00:00Z');
    return !isNaN(d)&&d.toISOString().slice(0,10)===s&&d.getUTCDay()===1?s:'';
  }
  function parseDom(doc) {
    var records=[],unresolved=[],tableCount=0,cellCount=0;
    Array.from(doc.querySelectorAll('table')).filter(function(t){return !hidden(t);}).forEach(function(table){
      var columns=Object.create(null),rowSections=Object.create(null),grid=[],origins=[];
      var rows=Array.from(table.rows||[]).filter(function(row){return !hidden(row);});
      rows.forEach(function(row,r){
        if(!grid[r])grid[r]=[];var col=0;
        Array.from(row.cells||[]).filter(function(cell){return !hidden(cell);}).forEach(function(cell){
          while(grid[r][col])col++;
          var rs=cell.getAttribute&&cell.getAttribute('rowspan')==='0'?rows.length-r:Math.max(1,Number(cell.rowSpan)||1),cs=Math.max(1,Number(cell.colSpan)||1);
          var value=text(cell.innerText||cell.textContent);
          for(var y=r;y<Math.min(rows.length,r+rs);y++){if(!grid[y])grid[y]=[];for(var x=col;x<col+cs;x++)grid[y][x]=cell;}
          var dm=value.match(/^(?:星期|周|礼拜)([一二三四五六日天])(?:\s|$)/);
          if(dm){var day=Math.min(7,'一二三四五六日天'.indexOf(dm[1])+1);for(var k=col;k<col+cs;k++)columns[k]=day;}
          var sm=value.match(/^(?:第)?(\d{1,2})(?:\s*[-~至]\s*(\d{1,2}))?\s*节?(?:\s*\n.*)?$/);
          if(col<2&&sm){var a=integer(sm[1],1,14),b=integer(sm[2]||sm[1],1,14);if(a&&b>=a)rowSections[r]={start:a,end:b};}
          origins.push({cell:cell,row:r,col:col,span:rs});col+=cs;
        });
      });
      if(Object.keys(columns).length<5)return;tableCount++;
      origins.forEach(function(o){
        if(!columns[o.col]||!rowSections[o.row])return;
        var first=rowSections[o.row],last=rowSections[o.row+o.span-1]||first,value=readableCell(o.cell);
        if(!text(value))return;cellCount++;
        var result=cellRecords(value,columns[o.col],first.start,last.end);
        records=records.concat(result.records);unresolved=unresolved.concat(result.unresolved);
      });
    });
    var selected=doc.querySelector('#allSemesters, select[name="semesterId"]');
    var result={courses:merge(records),unresolved:unresolved,warnings:records.length?['已读取当前页面全部可见课表格；请将教务周次选为“全部周次”后导入。']:[],source:'CUPK 课表页面',semester:selected&&selected.options?text(selected.options[selected.selectedIndex]&&selected.options[selected.selectedIndex].textContent):'',startDate:semesterStart(doc),coverage:{tables:tableCount,cells:cellCount,parsed:records.length,unresolved:unresolved.length}};
    if(unresolved.length)result.warnings.push('另有 '+unresolved.length+' 条记录待核对，已在下方列出原因。');
    return result;
  }
  function scalar(source, name) {
    var m = source.match(new RegExp('(?:var|let|const)\\s+' + name + '\\s*=\\s*[\"\']?(\\d+)'));
    return m ? integer(m[1], 1, Number.MAX_SAFE_INTEGER) : null;
  }
  function htmlInfo(html, url) {
    var doc = new root.DOMParser().parseFromString(html, 'text/html'), semesters = [], sel = doc.querySelector('#allSemesters, select[name="semesterId"]');
    var selected = sel && (sel.querySelector('option[selected]') || sel.options[sel.selectedIndex]);
    var sid = selected && integer(selected.value, 1, Number.MAX_SAFE_INTEGER);
    var match = (url || '').match(/\/course-table\/info\/(\d+)/), student = scalar(html, 'studentId') || (match && Number(match[1]));
    var sem = scalar(html, 'semesterId'), biz = scalar(html, 'bizTypeId') || (html.match(/bizTypeId\s*:\s*(\d+)/) || [])[1];
    var current = html.match(/currentSemester\s*=\s*(\{[^;]*\})\s*;/);
    if (current) { try { var c = JSON.parse(current[1]); sem = sem || integer(c.id, 1, Number.MAX_SAFE_INTEGER); semesters.push(c); } catch (_) {} }
    var sm = html.match(/semesters\s*=\s*JSON\.parse\(\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")\s*\)/);
    if (sm) {
      try { var quoted = sm[1], decoded = quoted.charAt(0) === '"' ? JSON.parse(quoted) : quoted.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\'); semesters = JSON.parse(decoded); } catch (_) {}
    }
    return { studentId: student, semesterId: sid || sem, bizTypeId: integer(biz, 0, 999), semesters: semesters, semester: selected ? text(selected.textContent) : '', doc: doc };
  }
  function liveInfo() {
    var html = root.document.documentElement.outerHTML, info = htmlInfo(html, root.location.href);
    try { if (typeof studentId !== 'undefined') info.studentId = integer(studentId, 1, Number.MAX_SAFE_INTEGER); } catch (_) {}
    try { if (typeof currentSemester !== 'undefined' && currentSemester) info.semesterId = info.semesterId || integer(currentSemester.id, 1, Number.MAX_SAFE_INTEGER); } catch (_) {}
    try { if (typeof semesters !== 'undefined' && Array.isArray(semesters)) info.semesters = semesters; } catch (_) {}
    try { if (typeof bizTypeId !== 'undefined') info.bizTypeId = integer(bizTypeId, 0, 999); } catch (_) {}
    var selected = root.document.querySelector('#allSemesters, select[name="semesterId"]');
    if (selected) { info.semesterId = integer(selected.value, 1, Number.MAX_SAFE_INTEGER) || info.semesterId; info.semester = text(selected.options && selected.options[selected.selectedIndex] && selected.options[selected.selectedIndex].textContent); }
    return info;
  }
  function semesterName(info) {
    if (info.semester) return info.semester;
    var sem = (info.semesters || []).find(function (s) { return text(s.id) === text(info.semesterId); });
    return sem ? [text(sem.schoolYear), text(sem.nameZh || sem.name)].filter(Boolean).join(' ') : '学期 ' + info.semesterId;
  }
  function loginPage(html, url) { return /\/(?:login|auth)(?:[/?]|$)/i.test(url || '') || /type\s*=\s*["']password["']/i.test(html) || /<title[^>]*>\s*(?:登入|登录)/.test(html); }
  async function request(path, body) {
    var target = new URL(path, ORIGIN);
    if (target.origin !== ORIGIN || !target.pathname.startsWith(CTX + '/')) throw new Error('已拒绝跨站读取。');
    if (body && !/^\/student\/ws\/schedule-table\/(datum|timetable-layout)$/.test(target.pathname)) throw new Error('已拒绝非课表查询接口。');
    var controller = new root.AbortController(), timeout = root.setTimeout(function () { controller.abort(); }, 18000);
    try {
      var response = await root.fetch(target.href, { method: body ? 'POST' : 'GET', credentials: 'same-origin', signal: controller.signal, headers: body ? { 'Content-Type': 'application/json;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' } : { 'X-Requested-With': 'XMLHttpRequest' }, body: body ? JSON.stringify(body) : undefined });
      if (!response.ok) throw new Error('课表读取 HTTP ' + response.status + '；请在浏览器中打开“我的课表”后重试。');
      if (new URL(response.url || target.href).origin !== ORIGIN) throw new Error('登录会话失效，请重新登录。');
      var raw = await response.text();
      if (loginPage(raw, response.url)) throw new Error('登录会话失效，请先登录教务系统。');
      return { raw: raw, url: response.url || target.href };
    } catch (e) { if (e.name === 'AbortError') throw new Error('教务系统读取超时，请检查网络或稍后重试。'); throw e; }
    finally { root.clearTimeout(timeout); }
  }
  function jsonResponse(response) {
    var data;
    try { data = JSON.parse(response.raw); } catch (_) { throw new Error('教务系统返回的不是课表 JSON；请确认登录和课表页面。'); }
    if (data == null || typeof data !== 'object' || data.success === false || data.ok === false) throw new Error('教务系统未返回有效排课数据。');
    return data;
  }
  function domUnits(doc) {
    var map = Object.create(null);
    Array.from(doc.querySelectorAll('[start-time][end-time]')).forEach(function (el) {
      var a = el.getAttribute('start-time'), b = el.getAttribute('end-time'), n = el.getAttribute('index-no') || el.getAttribute('data-index') || el.getAttribute('unit-index');
      if (integer(n, 1, 14)) map[n] = { indexNo: Number(n), startTime: a, endTime: b };
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  async function read() {
    if (!root.location || root.location.origin !== ORIGIN) throw new Error('请先进入中国石油大学（北京）克拉玛依校区教务系统。');
    if (loginPage(root.document.documentElement.outerHTML, root.location.href)) throw new Error('请先手动登录教务系统，再打开“我的课表”。');
    var info = liveInfo(), warnings = [], savedDoc = root.document, layoutVerified = false;
    try {
    if (!info.studentId || !info.semesterId) {
      var page = await request(CTX + '/for-std/course-table'), parsed = htmlInfo(page.raw, page.url);
      info.studentId = info.studentId || parsed.studentId; info.semesterId = info.semesterId || parsed.semesterId;
      info.bizTypeId = info.bizTypeId != null ? info.bizTypeId : parsed.bizTypeId;
      info.semesters = info.semesters.length ? info.semesters : parsed.semesters; info.semester = info.semester || parsed.semester;
      savedDoc = parsed.doc;
    }
      if (!info.studentId || !info.semesterId) throw new Error('未找到学期或学生课表标识，请在“我的课表”选择学期后重试。');
      // EAMS5 default bizTypeId=2 is a compatibility candidate; no ID is invented.
      var biz = info.bizTypeId != null ? info.bizTypeId : 2;
      var gd = jsonResponse(await request(CTX + '/for-std/course-table/get-data?bizTypeId=' + encodeURIComponent(biz) + '&semesterId=' + encodeURIComponent(info.semesterId) + '&dataId=' + encodeURIComponent(info.studentId)));
      gd = gd.result && Array.isArray(gd.result.lessonIds) ? gd.result : gd;
      if (!Array.isArray(gd.lessonIds) || gd.lessonIds.some(function (id) { return integer(id, 1, Number.MAX_SAFE_INTEGER) == null; })) throw new Error('课程任务响应格式变化：lessonIds 不完整。');
      if (!gd.lessonIds.length) return { courses: [], warnings: ['该学期暂无课程任务。'], source: 'CUPK 教务系统', semester: semesterName(info) };
      var units = domUnits(savedDoc);
      if (integer(gd.timeTableLayoutId, 1, Number.MAX_SAFE_INTEGER) != null) {
        try { var layout = jsonResponse(await request(CTX + '/ws/schedule-table/timetable-layout', { timeTableLayoutId: gd.timeTableLayoutId }));
          var lu = layout.result && layout.result.courseUnitList; if (normalizeUnits(lu).length) { units = lu; layoutVerified = true; }
        } catch (_) { warnings.push('作息时间查询失败，尝试使用页面提供的节次。'); }
      }
      var data = jsonResponse(await request(CTX + '/ws/schedule-table/datum', { lessonIds: gd.lessonIds, studentId: info.studentId, weekIndex: '' }));
      var output = convertDatum(data, units, gd.lessonId2Flag); output.semester = semesterName(info); output.startDate=semesterStart(root.document)||semesterStart(savedDoc); output.warnings = warnings.concat(output.warnings);
      if (!layoutVerified) delete output.times;
      if (!output.courses.length && output.warnings.length) throw new Error(output.warnings.join(' '));
      return output;
    } catch (error) {
      var fallback = parseDom(root.document);
      if (!fallback.courses.length && savedDoc !== root.document) fallback = parseDom(savedDoc);
      if (!fallback.courses.length) throw error;
      fallback.warnings.unshift('结构化读取未完成：' + error.message); fallback.semester = info.semesterId ? semesterName(info) : fallback.semester;
      return fallback;
    }
  }
  function run() {
    if (root.__qingImport && root.__qingImport.status === 'running') return Promise.resolve(JSON.stringify({ error: '正在读取，请稍候。' }));
    var token = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    root.__qingImport = { status: 'running', token: token };
    return read().then(function (result) {
      root.__qingImport = { status: 'done', token: token, result: result };
      return JSON.stringify(result);
    }).catch(function (error) {
      root.__qingImport = { status: 'error', token: token, error: error.message || '课表读取失败。' };
      return JSON.stringify({ error: root.__qingImport.error });
    });
  }
  return { run: run, read: read, convertDatum: convertDatum, parseWeeks: weeks, normalizeUnits: normalizeUnits, verifiedTimes: verifiedTimes, sections: sections, parseCell: parseCell, cellRecords:cellRecords, parseDom: parseDom, htmlInfo: htmlInfo, version: '1.0.2' };
});
