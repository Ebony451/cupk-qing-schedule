(function () {
  'use strict';
  var C = window.QingCore, native = window.Native || null, state = C.defaults(), page = 'schedule', week = 1, filter = '待完成', toastTimer, pendingImport = null, pendingTimes = null, pendingIssues=[], pendingStartDate='', pendingSemester='', lastImportReport=null, brokenData = null;
  var days = ['一','二','三','四','五','六','日'];
  var main = document.getElementById('main'), modal = document.getElementById('modal');
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]; }); }
  function toast(s) { var el = document.getElementById('toast'); el.textContent = s; el.className = 'show'; clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.className = ''; }, 3200); }
  function stored() { return native ? native.load() : localStorage.getItem('qing-state'); }
  try { var raw = stored(); if (raw) state = C.normalizeState(JSON.parse(raw)); } catch (err) { brokenData = typeof raw === 'string' ? raw : ''; toast('已有数据读取失败，请从备份恢复：' + err.message); }
  var initialWeek = C.currentWeek(state.settings.startDate); week = initialWeek === null ? 1 : Math.max(1, Math.min(state.settings.weeks, initialWeek));
  function save(next) {
    try { if (brokenData !== null) throw new Error('已有数据读取异常，请在设置中先导出原始数据并恢复有效备份'); next = C.normalizeState(next || state); var json = JSON.stringify(next); if (native) native.save(json); else localStorage.setItem('qing-state', json); state = next; return true; }
    catch (err) { toast('未保存：' + err.message); return false; }
  }
  function commit(next, msg) { if (!save(next)) return false; render(); if (msg) toast(msg); return true; }
  function clone() { return JSON.parse(JSON.stringify(state)); }
  function render() {
    var theme = { mint:['#238d78','#e0f5ed'], blue:['#4977ae','#e5effb'], violet:['#8466ac','#f0e8fa'] }[state.settings.theme];
    document.documentElement.style.setProperty('--accent', theme[0]); document.documentElement.style.setProperty('--accent-light', theme[1]);
    document.getElementById('semester').textContent = state.settings.semester;
    document.querySelectorAll('[data-page]').forEach(function (b) { b.classList.toggle('active', b.dataset.page === page); });
    if (page === 'schedule') renderSchedule(); else if (page === 'tasks') renderTasks(); else renderSettings();
  }
  function renderSchedule() {
    week = week===0?0:Math.max(1, Math.min(state.settings.weeks, week));
    var current = C.currentWeek(state.settings.startDate), monday = week?C.addDays(state.settings.startDate, (week - 1) * 7):'', options = '<option value="0"'+(week===0?' selected':'')+'>全部周次</option>', now = C.today();
    for (var w = 1; w <= state.settings.weeks; w++) options += '<option value="' + w + '"' + (w === week ? ' selected' : '') + '>第 ' + w + ' 周</option>';
    var html = '<div class="week-controls"><button class="arrow" data-action="prev" aria-label="上一周"' + (week <= 1 ? ' disabled' : '') + '>‹</button><select class="week-selector" id="week-select" aria-label="选择周次">' + options + '</select><button class="arrow" data-action="next" aria-label="下一周"' + (week === 0 || week === state.settings.weeks ? ' disabled' : '') + '>›</button><span class="week-status">' + (current === null ? '学期尚未设置' : current < 1 ? '学期尚未开始' : current > state.settings.weeks ? '学期已结束' : (week === current ? '正在进行' : '当前第 ' + current + ' 周')) + '</span><button class="chip-button" data-action="this-week">本周</button></div>';
    if (brokenData !== null) html += '<div class="notice"><span>已有数据读取异常，已停止覆盖保存。请前往设置导出原始数据并恢复备份。</span><button data-page="settings">去设置 →</button></div>';
    if (!state.settings.startDate) html += '<div class="notice"><span>设置开学日期后，即可看到每周日期并开启课前提醒。</span><button data-page="settings">去设置 →</button></div>';
    if (!state.courses.length) html += '<div class="intro-empty"><div class="intro-icon">▤</div><div><strong>把课表装进口袋</strong><p>导入教务课表，或手动添加第一门课。</p></div><button class="secondary" data-action="import">导入</button></div>';
    if(state.importIssues.length)html+='<div class="notice"><span>上次导入有 '+state.importIssues.length+' 条安排尚待核对。</span><button data-action="import-issues">查看原因 →</button></div>';
    if(state.courses.length&&state.settings.timeSource==='unverified')html+='<div class="notice"><span>节次已保存；尚未取得学校作息，不显示推测的钟点。</span><button data-page="settings">核对时间 →</button></div>';
    var active = state.courses.filter(function (c) { return week===0||c.weeks.indexOf(week) >= 0; });
    var pairs = C.conflictPairs(active);
    if (pairs.length) html += '<div class="conflict-note">有 ' + pairs.length + ' 组课程时间重叠，点击虚线卡片查看全部课程。</div>';
    html += '<div class="calendar-wrap"><div class="day-header"><div class="month">' + (monday ? +monday.slice(5,7) + '月' : '节次') + '</div>';
    for (var d = 1; d <= 7; d++) { var date = monday ? C.addDays(monday, d - 1) : ''; html += '<div class="day-label ' + (date === now ? 'today' : '') + '">周' + days[d - 1] + '<span class="date-label">' + (date ? +date.slice(8) : '—') + '</span></div>'; }
    html += '</div><div class="week-grid" style="--periods:'+state.settings.times.length+'">';
    for (var p = 1; p <= state.settings.times.length; p++) html += '<div class="slot-line" style="grid-row:' + p + '"></div><div class="period" style="grid-row:' + p + '">' + p + '<small>' + (state.settings.timeSource==='unverified'?'待设置':e(state.settings.times[p - 1].start)) + '</small></div>';
    for (var day = 1; day <= 7; day++) {
      html += '<div class="day-bg ' + (monday && C.addDays(monday, day - 1) === now ? 'current' : '') + '" style="grid-column:' + (day + 1) + ';grid-row:1/'+(state.settings.times.length+1)+'"></div>';
      var items = active.filter(function (c) { return c.day === day; }).sort(function (a,b) { return a.start - b.start; }), groups = [];
      items.forEach(function (c) { var g = groups[groups.length - 1]; if (g && c.start <= g.end) { g.courses.push(c); g.end = Math.max(g.end,c.end); } else groups.push({start:c.start,end:c.end,courses:[c]}); });
      groups.forEach(function (g) {
        var c = g.courses[0], multi = g.courses.length > 1;
        html += '<button class="course c' + c.color + (multi ? ' conflict' : '') + '" style="grid-column:' + (day + 1) + ';grid-row:' + g.start + '/' + (g.end + 1) + '" data-action="' + (multi ? 'conflict' : 'detail') + '" data-id="' + e(multi ? g.courses.map(function (c) {return c.id;}).join('|') : c.id) + '" aria-label="' + e(g.courses.map(function (c) {return c.name;}).join('、')) + '">';
        if (multi) { Array.from(new Set(g.courses.map(function(c){return c.name;}))).forEach(function (name) { html += '<strong>' + e(name) + '</strong>'; }); html += '<span class="badge">' + g.courses.length + ' 条安排</span>'; }
        else html += '<strong>' + e(c.name) + '</strong><small>' + e(c.room || '地点待定') + '</small>';
        html += '</button>';
      });
    }
    html += '</div></div><div class="schedule-footer"><span>'+(week===0?'全学期':'本周')+' '+new Set(active.map(function(c){return c.name;})).size+' 门 · '+active.length+' 条安排</span><button class="list-link" data-action="course-list">全部课程 →</button></div><button class="floating-add" data-action="add-course" aria-label="添加课程">+</button>';
    main.innerHTML = html;
    document.getElementById('week-select').onchange = function () { week = +this.value; renderSchedule(); };
  }
  function renderTasks() {
    var pending = state.tasks.filter(function (t) {return !t.done;}).length;
    var html = '<div class="page-content"><div class="page-heading"><h2>待办清单</h2><span class="count-pill">' + pending + ' 项待完成</span></div><p class="section-subtitle">把作业、考试和重要安排，放在一起。</p><div class="filters">';
    ['待完成','已完成','全部'].forEach(function (f) {html += '<button data-action="task-filter" data-id="' + f + '" class="' + (filter === f ? 'active' : '') + '">' + f + '</button>';});
    html += '</div>';
    var tasks = state.tasks.filter(function (t) { return filter === '全部' || (filter === '已完成' ? t.done : !t.done); }).sort(function (a,b) {return a.date.localeCompare(b.date);});
    tasks.forEach(function (t) { html += '<div class="card task ' + (t.done ? 'done' : '') + (!t.done && t.date < C.today() ? ' overdue' : '') + '"><button class="check" data-action="toggle-task" data-id="' + e(t.id) + '" aria-label="' + (t.done ? '标记未完成' : '标记完成') + '">' + (t.done ? '✓' : '') + '</button><div class="task-main"><button class="title" data-action="edit-task" data-id="' + e(t.id) + '">' + e(t.name) + '</button><div class="meta"><span class="tag">' + e(t.type) + '</span>' + e(t.date) + (!t.done && t.date < C.today() ? ' · 已逾期' : '') + '</div>' + (t.note ? '<div class="hint" style="margin-top:8px;white-space:pre-wrap">' + e(t.note) + '</div>' : '') + '</div></div>'; });
    if (!tasks.length) html += '<div class="card empty"><div class="empty-icon">✓</div><strong>' + (filter === '已完成' ? '完成的事情会留在这里' : '轻松安排每一天') + '</strong><div>点击右下角，记录新的安排。</div></div>';
    html += '</div><button class="floating-add" data-action="add-task" aria-label="添加待办">+</button>'; main.innerHTML = html;
  }
  function field(label, name, value, type, extra) { return '<label class="field">' + e(label) + '<input name="' + name + '" type="' + (type || 'text') + '" value="' + e(value) + '" ' + (extra || '') + '></label>'; }
  function renderSettings() {
    var s = state.settings;
    var html = '<div class="page-content"><div class="page-heading"><h2>课表设置</h2></div><p class="section-subtitle">按自己的学习节奏，设置这个学期。</p><form id="settings-form"><div class="card"><h3>学期信息</h3>' + field('学期名称','semester',s.semester,'text','maxlength="80" required') + field('第一周的周一','startDate',s.startDate,'date') + '<p class="hint">请以学校校历为准，不确定时可先留空。日期必须是周一。</p><div class="form-row">' + field('学期周数','weeks',s.weeks,'number','min="1" max="30" required') + field('课前提醒（分钟）','reminder',s.reminder,'number','min="0" max="120" required') + '</div><p class="hint">设为 0 关闭提醒。提醒需要允许应用发送通知；修改后自动重新安排。开启提醒还需填写开学日期。</p><label class="field">主题颜色<select name="theme"><option value="mint"' + (s.theme === 'mint' ? ' selected' : '') + '>薄荷青</option><option value="blue"' + (s.theme === 'blue' ? ' selected' : '') + '>天空蓝</option><option value="violet"' + (s.theme === 'violet' ? ' selected' : '') + '>浅紫</option></select></label></div><div class="card"><h3>上课时间</h3><p class="hint">未核对的时间仅作为编辑模板，不用于课表钟点、日历或提醒。请按学校实际作息填写。</p>';
    html += field('每日节数','periodCount',s.times.length,'number','min="1" max="14" required');
    C.defaults().settings.times.map(function(t,i){return s.times[i]||t;}).forEach(function (t,i) {html += '<div class="time-row" data-period="'+i+'"'+(i>=s.times.length?' hidden':'')+'><span>第 ' + (i + 1) + ' 节</span><input type="time" name="start' + i + '" value="' + e(t.start) + '" required aria-label="第' + (i+1) + '节开始时间"><span>–</span><input type="time" name="end' + i + '" value="' + e(t.end) + '" required aria-label="第' + (i+1) + '节结束时间"></div>';});
    html += '<label class="hint"><input type="checkbox" name="timeVerified"'+(s.timeSource!=='unverified'?' checked':'')+'> 我已按学校作息核对以上各节时间</label><button type="submit" class="primary" style="width:100%;margin-top:15px">保存设置</button></div></form><div class="card"><h3>教务课表导入</h3><p class="hint">中国石油大学（北京）克拉玛依校区<br>登录教务系统后，在课表页面点击“读取课表”。导入前可预览结果。</p><div class="section-actions"><button class="secondary" data-action="import">打开教务系统</button><button class="plain" data-action="clear-session">清除登录会话</button></div></div><div class="card"><h3>数据与备份</h3><p class="hint">数据保存在本机。JSON 备份包含课程、待办和设置；ICS 可导入系统日历。</p><div class="section-actions"><button class="secondary" data-action="backup-export">导出备份</button><button class="plain" data-action="backup-import">恢复备份</button><button class="plain" data-action="ics-export">导出日历</button></div></div><div class="card"><h3>探索轻课表</h3><p class="hint">主动添加示例课程，了解周课表的显示方式。</p><button class="plain" data-action="demo">添加演示课表</button></div><p class="about-mark">轻课表 · 让每一天更有条理<br>独立原创应用 · 数据由你掌握</p></div>';
    main.innerHTML = html;
    document.querySelector('[name=periodCount]').oninput=function(){var n=+this.value;document.querySelectorAll('[data-period]').forEach(function(row){row.hidden=+row.dataset.period>=n;});};
    document.getElementById('settings-form').onsubmit = function (event) {
      event.preventDefault(); var f = new FormData(this), next = clone(); next.settings = {semester:f.get('semester'),startDate:f.get('startDate'),weeks:+f.get('weeks'),reminder:+f.get('reminder'),theme:f.get('theme'),timeSource:f.get('timeVerified')?'manual':'unverified',times:[]};
      if(!f.get('timeVerified'))next.settings.reminder=0;
      for (var i = 0; i < +f.get('periodCount'); i++) next.settings.times.push({start:f.get('start'+i),end:f.get('end'+i)});
      if (commit(next,'设置已保存')) week = Math.max(1,Math.min(week,state.settings.weeks));
    };
  }
  function sheet(title, content) { modal.innerHTML = '<section class="sheet" role="dialog" aria-modal="true" aria-label="' + e(title) + '"><div class="sheet-header"><h2>' + e(title) + '</h2><button data-action="close" aria-label="关闭">×</button></div>' + content + '</section>'; modal.hidden = false; document.body.style.overflow = 'hidden'; }
  function close() { modal.hidden = true; modal.innerHTML = ''; document.body.style.overflow = ''; }
  function ask(title, message, label, action) { sheet(title,'<p class="section-subtitle">' + e(message) + '</p><div class="actions"><button class="plain" data-action="close">取消</button><button class="primary" id="confirm-action">' + e(label) + '</button></div>'); document.getElementById('confirm-action').onclick = function () { if (action() !== false) close(); }; }
  function courseById(id) { return state.courses.find(function (c) {return c.id === id;}); }
  function detail(id) {
    var c = courseById(id); if (!c) return;
    sheet('课程详情','<div class="detail-title">' + e(c.name) + '</div><div class="detail-row"><span>时间</span><span>周' + days[c.day-1] + ' · 第 ' + c.start + '–' + c.end + ' 节<br>' + (state.settings.timeSource==='unverified'?'学校作息待核对':state.settings.times[c.start-1].start + '–' + state.settings.times[c.end-1].end) + '</span></div><div class="detail-row"><span>周次</span><span>' + e(C.weekText(c.weeks)) + ' 周</span></div><div class="detail-row"><span>教室</span><span>' + e(c.room || '未填写') + '</span></div><div class="detail-row"><span>教师</span><span>' + e(c.teacher || '未填写') + '</span></div><div class="actions"><button class="danger" data-action="delete-course" data-id="' + e(c.id) + '">删除</button><button class="primary" data-action="edit-course" data-id="' + e(c.id) + '">编辑课程</button></div>');
  }
  function courseList(items, title) {
    sheet(title,items.length ? items.map(function (c) {return '<button class="course-list-item" data-action="detail" data-id="' + e(c.id) + '"><strong>' + e(c.name) + '</strong><small>周' + days[c.day-1] + ' · 第 ' + c.start + '–' + c.end + ' 节 · ' + e(c.room || '地点待定') + '<br>' + e(C.weekText(c.weeks)) + ' 周</small></button>';}).join('') : '<div class="empty">还没有课程，点击首页的 + 添加。</div>');
  }
  function courseEditor(id) {
    var c = courseById(id) || {id:'',name:'',teacher:'',room:'',day:1,start:1,end:Math.min(2,state.settings.times.length),weeks:C.parseWeeks('1-' + state.settings.weeks),color:0};
    var weekdays = days.map(function (d,i) {return '<option value="' + (i+1) + '"' + (c.day === i+1 ? ' selected' : '') + '>星期' + d + '</option>';}).join('');
    var html = '<form id="course-form">' + field('课程名称','name',c.name,'text','required maxlength="120" placeholder="例如：高等数学"') + '<div class="form-row">' + field('教师','teacher',c.teacher,'text','maxlength="120" placeholder="选填"') + field('教室','room',c.room,'text','maxlength="160" placeholder="例如：教学楼 A203"') + '</div><label class="field">星期<select name="day">' + weekdays + '</select></label><div class="form-row">' + field('开始节次','start',c.start,'number','min="1" max="'+state.settings.times.length+'" required') + field('结束节次','end',c.end,'number','min="1" max="'+state.settings.times.length+'" required') + '</div>' + field('上课周次','weeks',C.weekText(c.weeks),'text','required placeholder="例如 1-16(单)、2,4,6 或 1-8,10-16"') + '<p class="hint">支持范围、逗号分隔与单双周，例如 1-16(单)。</p><span class="field">卡片颜色</span><input type="hidden" name="color" value="' + c.color + '"><div class="color-picker">';
    for (var i = 0; i < 8; i++) html += '<button type="button" class="c' + i + (i === c.color ? ' selected' : '') + '" data-action="color" data-id="' + i + '" aria-label="颜色 ' + (i+1) + '"></button>';
    html += '</div><button type="submit" class="primary" style="width:100%">保存课程</button></form>'; sheet(c.id ? '编辑课程' : '添加课程',html);
    document.getElementById('course-form').onsubmit = function (event) { event.preventDefault(); var f = new FormData(this), next = clone(); try { var updated = C.normalizeCourse({id:c.id,name:f.get('name'),teacher:f.get('teacher'),room:f.get('room'),day:+f.get('day'),start:+f.get('start'),end:+f.get('end'),weeks:f.get('weeks'),color:+f.get('color')},state.settings.weeks); var index = next.courses.findIndex(function (v) {return v.id === c.id;}); if (index >= 0) next.courses[index] = updated; else next.courses.push(updated); if (commit(next,'课程已保存')) close(); } catch (err) {toast(err.message);} };
  }
  function taskEditor(id) {
    var t = state.tasks.find(function (t) {return t.id === id;}) || {id:'',name:'',type:'作业',date:C.today(),note:'',done:false};
    var html = '<form id="task-form">' + field('待办标题','name',t.name,'text','required maxlength="160" placeholder="例如：完成数学作业"') + '<label class="field">类型<select name="type">' + ['作业','考试','事件'].map(function (type) {return '<option' + (type === t.type ? ' selected' : '') + '>' + type + '</option>';}).join('') + '</select></label>' + field('日期','date',t.date,'date','required') + '<label class="field">备注<textarea name="note" maxlength="500" placeholder="选填">' + e(t.note) + '</textarea></label><div class="actions">' + (t.id ? '<button type="button" class="danger" data-action="delete-task" data-id="' + e(t.id) + '">删除</button>' : '') + '<button type="submit" class="primary">保存待办</button></div></form>'; sheet(t.id ? '编辑待办' : '添加待办',html);
    document.getElementById('task-form').onsubmit = function (event) { event.preventDefault(); var f = new FormData(this), next = clone(); try {var updated = C.normalizeTask({id:t.id,name:f.get('name'),date:f.get('date'),type:f.get('type'),note:f.get('note'),done:t.done}); var index = next.tasks.findIndex(function (v) {return v.id === t.id;}); if (index >= 0) next.tasks[index] = updated; else next.tasks.push(updated); if (commit(next,'待办已保存')) close();} catch (err) {toast(err.message);} };
  }
  function exportFile(name, mime, contents) {
    if (native) { native.exportFile(name,mime,contents); return; }
    var url = URL.createObjectURL(new Blob([contents],{type:mime})), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(function () {URL.revokeObjectURL(url);},1000); toast('文件已导出');
  }
  function openImport() {
    if (native) { close(); native.openImport(); }
    else sheet('教务课表导入','<p class="section-subtitle">请在安卓应用中使用教务导入。登录中国石油大学（北京）克拉玛依校区教务系统后，在课表页面读取课程。</p><button class="primary" data-action="close">知道了</button>');
  }
  function issuesHtml(issues) {
    return issues.map(function(x){return '<div class="import-item"><strong>'+e(x.name||'未命名课程')+'</strong><small>'+e(x.reason)+'<br>'+e(x.details||'')+'</small></div>';}).join('');
  }
  function receiveImport(result) {
    try { if (typeof result === 'string') result = JSON.parse(result); } catch (err) { toast('导入结果格式错误'); return; }
    result = result || {}; var valid = [], warnings = Array.isArray(result.warnings) ? result.warnings.slice() : [], courses = Array.isArray(result.courses) ? result.courses : [];
    pendingIssues=Array.isArray(result.unresolved)?result.unresolved.slice():[];
    courses.forEach(function (c,i) {try {valid.push(C.normalizeCourse(c,30));} catch (err) {pendingIssues.push({name:c&&c.name||'第 '+(i+1)+' 条安排',reason:err.message});} });
    pendingImport = valid; pendingTimes = null; pendingStartDate=result.startDate||state.settings.startDate;pendingSemester=result.semester||'';
    if (Array.isArray(result.times) && result.times.length) {
      try { pendingTimes = C.normalizeSettings(Object.assign({},state.settings,{times:result.times})).times;
        if(valid.some(function(c){return c.end>pendingTimes.length;}))throw new Error('课程节次超过作息节数');
      } catch (err) { pendingTimes=null;warnings.push('导入作息未通过校验：' + err.message); }
    }
    if (!pendingTimes && valid.length) warnings.push('未取得完整学校作息：保存节次，钟点显示“待设置”，并关闭课前提醒。可在设置中核对作息。');
    if (!valid.length) warnings.push('未识别到可导入课程。请在教务系统中打开学期课表，选择全部周次后再读取。原课表不会被覆盖。');
    var maxWeek = valid.reduce(function (n,c) {return Math.max(n,Math.max.apply(null,c.weeks));},0);
    if (maxWeek > state.settings.weeks) warnings.push('导入后学期周数将扩展到 ' + maxWeek + ' 周。');
    var html = '<p class="section-subtitle">识别到 '+new Set(valid.map(function(c){return c.name;})).size+' 门课程 · ' + valid.length + ' 条安排。保存后显示全部周次，方便与教务课表核对。</p>' + (warnings.length ? '<div class="warnings">' + warnings.map(function (w) {return '• ' + e(w);}).join('\n') + '</div>' : '');
    html+=field('第一周的周一（请核对）','importStartDate',pendingStartDate,'date')+'<p class="hint">'+(result.startDate?'已从教务页面识别学期起始日期。':'未识别到校历日期，可手动填写或暂时留空。')+'</p>';
    if(pendingIssues.length)html+='<details open><summary>待核对 '+pendingIssues.length+' 条安排（不自动放入课表）</summary>'+issuesHtml(pendingIssues)+'</details>';
    if (pendingTimes) html += '<details class="import-item"><summary>将应用 '+pendingTimes.length+' 节学校作息 · 点击核对</summary><p class="hint">' + pendingTimes.map(function (t,i) {return '第 ' + (i+1) + ' 节　' + e(t.start) + '–' + e(t.end);}).join('<br>') + '</p></details>';
    valid.forEach(function (c) {html += '<div class="import-item"><strong>' + e(c.name) + '</strong><small>周' + days[c.day-1] + ' · ' + c.start + '–' + c.end + ' 节 · ' + e(C.weekText(c.weeks)) + ' 周<br>' + e(c.room || '地点待定') + (c.teacher ? ' · ' + e(c.teacher) : '') + '</small></div>';});
    html += '<button class="plain" data-action="import-report">导出核对报告</button><div class="actions"><button class="secondary" data-action="import-append"' + (!valid.length ? ' disabled' : '') + '>追加课程</button><button class="primary" data-action="import-replace"' + (!valid.length ? ' disabled' : '') + '>替换课表</button></div>'; sheet('导入预览',html);
    document.querySelector('[name=importStartDate]').onchange=function(){pendingStartDate=this.value;};
    lastImportReport={version:'1.0.2',source:result.source||'',semester:pendingSemester,startDate:pendingStartDate,courses:valid,unresolved:pendingIssues,warnings:warnings,times:pendingTimes,coverage:result.coverage||null};
  }
  function applyImport(replace) {
    if (!pendingImport || !pendingImport.length) {toast('没有可导入课程');return false;}
    var next = clone(), signature = function (c) {return JSON.stringify([c.name,c.teacher,c.room,c.day,c.start,c.end,c.weeks]);};
    if (replace) next.courses = [];
    if (pendingTimes) {next.settings.times=pendingTimes;next.settings.timeSource='school';}
    else {next.settings.timeSource='unverified';next.settings.reminder=0;var required=pendingImport.reduce(function(n,c){return Math.max(n,c.end);},next.settings.times.length);while(next.settings.times.length<required)next.settings.times.push(C.defaults().settings.times[next.settings.times.length]);}
    next.settings.startDate=pendingStartDate;if(pendingSemester)next.settings.semester=pendingSemester;
    next.importIssues=replace?pendingIssues.slice():next.importIssues.concat(pendingIssues);
    var seen = new Set(next.courses.map(signature)), count = 0;
    pendingImport.forEach(function (c) { if (seen.has(signature(c))) return; seen.add(signature(c)); var copy = Object.assign({},c,{id:C.uid()}); next.courses.push(copy); count++; next.settings.weeks = Math.max(next.settings.weeks,Math.max.apply(null,c.weeks)); });
    if (save(next)) {pendingImport = null; pendingTimes = null; page = 'schedule'; week=0;render();toast('已导入 ' + count + ' 条安排');close();return true;} return false;
  }
  function demo() {
    ask('添加演示课程','将追加 6 条示例课程。你可以随时在课程详情中删除；开学日期由你自行设置。','添加示例',function () {
      var next = clone(), sample = [['高等数学','A203',1,1,2,0],['大学英语','B105',2,3,4,1],['程序设计','机房 302',3,7,8,2],['大学物理','A406',4,1,2,3],['体育','田径场',5,9,10,5],['形势与政策','报告厅',1,7,8,4]];
      sample.forEach(function (row) {next.courses.push(C.normalizeCourse({name:row[0],room:row[1],teacher:'示例教师',day:row[2],start:row[3],end:row[4],color:row[5],weeks:'1-' + Math.min(16,next.settings.weeks)},next.settings.weeks));}); return commit(next,'已添加演示课程');
    });
  }
  function action(event) {
    var button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.page) {page = button.dataset.page; render(); window.scrollTo(0,0); return;}
    var a = button.dataset.action, id = button.dataset.id;
    if (a === 'prev') {week--;renderSchedule();} else if (a === 'next') {week++;renderSchedule();}
    else if (a === 'this-week') {var current = C.currentWeek(state.settings.startDate); if (current === null) {page = 'settings';render();toast('请先设置第一周的周一');} else if (current < 1 || current > state.settings.weeks) toast('当前日期不在本学期内'); else {week = current;renderSchedule();}}
    else if (a === 'close') close(); else if (a === 'import') openImport();
    else if (a === 'add-course') courseEditor(); else if (a === 'edit-course') courseEditor(id); else if (a === 'detail') detail(id);
    else if (a === 'course-list') courseList(state.courses,'全部课程');
    else if (a === 'conflict') courseList(state.courses.filter(function (c) {return id.split('|').indexOf(c.id) >= 0;}),week===0?'此时段的学期安排':'重叠课程');
    else if (a === 'delete-course') {var c = courseById(id); if (c) ask('删除课程','确定删除“' + c.name + '”？','删除',function () {var next = clone();next.courses = next.courses.filter(function (v) {return v.id !== id;});return commit(next,'课程已删除');});}
    else if (a === 'color') {var form = document.getElementById('course-form');form.elements.color.value = id;form.querySelectorAll('.color-picker button').forEach(function (b) {b.classList.toggle('selected',b === button);});}
    else if (a === 'task-filter') {filter = id;renderTasks();} else if (a === 'add-task') taskEditor(); else if (a === 'edit-task') taskEditor(id);
    else if (a === 'toggle-task') {var next = clone(), t = next.tasks.find(function (v) {return v.id === id;}); if (t) {t.done = !t.done;commit(next);}}
    else if (a === 'delete-task') ask('删除待办','确定删除这条待办？','删除',function () {var next = clone();next.tasks = next.tasks.filter(function (v) {return v.id !== id;});return commit(next,'待办已删除');});
    else if(a==='import-issues')sheet('导入待核对安排',issuesHtml(state.importIssues));
    else if(a==='import-report'){lastImportReport.startDate=pendingStartDate;exportFile('课表核对报告.json','application/json',JSON.stringify(lastImportReport,null,2));}
    else if (a === 'backup-export') exportFile('轻课表备份-' + C.today() + '.json','application/json',brokenData === null ? JSON.stringify(state,null,2) : brokenData);
    else if (a === 'backup-import') document.getElementById('backup-file').click();
    else if (a === 'ics-export') {try {exportFile('轻课表-' + C.today() + '.ics','text/calendar',C.calendar(state));} catch (err) {toast(err.message);}}
    else if (a === 'clear-session') ask('清除登录会话','下次导入时需重新登录教务系统。已保存的课程和待办不受影响。','清除',function () {if (native) native.clearSession();toast('登录会话已清除');});
    else if (a === 'demo') demo(); else if (a === 'import-append') applyImport(false);
    else if (a === 'import-replace') ask('替换现有课表','将用本次识别到的 ' + pendingImport.length + ' 条安排替换当前全部课程，并应用预览中的学期日期。待办保留。','替换课表',function () {return applyImport(true);});
  }
  document.addEventListener('click',action);
  document.getElementById('import-top').onclick = openImport;
  modal.addEventListener('click',function (event) {if (event.target === modal) close();});
  document.addEventListener('keydown',function (event) {if (event.key === 'Escape') close();});
  document.getElementById('backup-file').onchange = function () {
    var input = this, file = input.files[0]; if (!file) return;
    if (file.size > 5000000) {toast('备份文件过大，请选择 5 MB 以内的 JSON');input.value = '';return;}
    var reader = new FileReader(); reader.onload = function () {try {var restored = C.normalizeState(JSON.parse(reader.result));ask('恢复备份','此备份含 ' + restored.courses.length + ' 条课程与 ' + restored.tasks.length + ' 条待办。恢复将替换本机现有数据。','恢复',function () {var oldBroken = brokenData;brokenData = null;if (!commit(restored,'备份已恢复')) {brokenData = oldBroken;return false;}return true;});} catch (err) {toast('备份读取失败：' + err.message);}input.value = '';}; reader.onerror = function () {toast('无法读取备份文件');input.value = '';};reader.readAsText(file,'UTF-8');
  };
  window.Qing = { receiveImport: receiveImport, notify: toast, back: function () {if (!modal.hidden) {close();return true;}if (page !== 'schedule') {page = 'schedule';render();return true;}return false;}, refresh: function () {try {var raw = stored();if(raw) state = C.normalizeState(JSON.parse(raw));render();}catch(err){toast(err.message);}} };
  render();
})();
