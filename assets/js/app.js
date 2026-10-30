(function(){
  const COLORS = ['teal','accent','rose','indigo'];
  let works = [];
  let saveTimer = null;

  const worksEl = document.getElementById('works');
  const overlay = document.getElementById('overlay');
  const saveDot = document.getElementById('saveDot');
  const saveText = document.getElementById('saveText');

  function uid(){ return 'id-' + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }

  function colorVar(c){
    if(c==='teal') return 'var(--teal)';
    if(c==='rose') return 'var(--rose)';
    if(c==='indigo') return 'var(--indigo)';
    return 'var(--accent)';
  }

  // ---- fill these in after creating your Supabase project (see setup notes) ----
  const SUPABASE_URL = 'https://uyyvbvjsqhxjuvwfdnxt.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5eXZidmpzcWh4anV2d2Zkbnh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNjYwODgsImV4cCI6MjEwNTk0MjA4OH0.Njv4YHUpHLZXaaIpNOo7Lp2uN8Bhpw0D2m6XTYwDU6k';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const CACHE_KEY = 'folio-cache';
  const USERNAME_CACHE_KEY = 'folio-username-cache';
  const DEMO_KEY = 'folio-demo-mode';
  let currentUser = null;
  let isDemo = false;
  let currentUsername = '';

  const DEMO_WORKS = [
    { id:'demo-2', category:'TEXTBOOK', title:'An Introduction to Thermal Physics', subtitle:'Daniel V. Schroeder', primary:{ unit:'Chapter', completed:3, total:10, currentLabel:'Chapter 4' },
      trackers:[], checklist:[ { id:'d2a', text:'Read & understand', done:true }, { id:'d2b', text:'Solve problems', done:false } ],
      showChecklist:true, createdAt:Date.now(), updatedAt:Date.now() },
    { id:'demo-3', category:'NOVEL', title:'The Hard Way', subtitle:'Lee Child', primary:{ unit:'Chapter', completed:28, total:49, currentLabel:'Chapter 28' },
      trackers:[], checklist:[], showChecklist:false, createdAt:Date.now(), updatedAt:Date.now() }
  ];

  function timeNow(){
    const t = new Date();
    const h = t.getHours()%12===0?12:t.getHours()%12;
    const m = String(t.getMinutes()).padStart(2,'0');
    const ap = t.getHours()>=12?'pm':'am';
    return h + ':' + m + ap;
  }

  function setSyncStatus(text, isError){
    saveDot.classList.remove('saving');
    saveDot.style.background = isError ? 'var(--rose)' : '';
    saveText.textContent = text;
  }

  function showConnectModal(errorMsg){
    document.getElementById('connectOverlay').classList.add('open');
    document.getElementById('signinStage').style.display = 'block';
    document.getElementById('checkEmailStage').style.display = 'none';
    const errEl = document.getElementById('connectError');
    if(errorMsg){ errEl.textContent = errorMsg; errEl.style.display = 'block'; }
    else { errEl.style.display = 'none'; }
  }

  function hideConnectModal(){
    document.getElementById('connectOverlay').classList.remove('open');
  }

  function enterDemoMode(){
    isDemo = true;
    sessionStorage.setItem(DEMO_KEY, '1');
    works = JSON.parse(JSON.stringify(DEMO_WORKS));
    document.getElementById('demoBanner').style.display = 'flex';
    hideConnectModal();
    setSyncStatus('demo — not saved', false);
    render();
  }

  function exitDemoMode(){
    isDemo = false;
    sessionStorage.removeItem(DEMO_KEY);
    document.getElementById('demoBanner').style.display = 'none';
    works = [];
    render();
    showConnectModal();
  }

  async function loadUserData(){
    const { data, error } = await sb.from('folio_data').select('data, username').eq('user_id', currentUser.id).maybeSingle();
    if(error) throw error;
    if(!data){
      const { error: insertError } = await sb.from('folio_data').insert({ user_id: currentUser.id, data: [] });
      if(insertError) throw insertError;
      currentUsername = '';
      return [];
    }
    if(!Array.isArray(data.data)) throw new Error('Saved Folio data is invalid.');
    currentUsername = (data.username || '').trim();
    return data.data;
  }

  async function init(){
    if(sessionStorage.getItem(DEMO_KEY) === '1'){
      enterDemoMode();
      return;
    }
    const { data: { session } } = await sb.auth.getSession();
    if(session && session.user){
      currentUser = session.user;
      await syncFromSupabase(true);
    } else {
      try{
        const cached = localStorage.getItem(CACHE_KEY);
        if(cached) works = JSON.parse(cached);
      }catch(e){}
      render();
      setSyncStatus('not signed in', true);
      showConnectModal();
    }
  }

  sb.auth.onAuthStateChange(async (event, session)=>{
    if(event === 'SIGNED_IN' && session && session.user){
      currentUser = session.user;
      hideConnectModal();
      await syncFromSupabase(true);
    } else if(event === 'SIGNED_OUT'){
      currentUser = null;
      currentUsername = '';
      localStorage.removeItem(USERNAME_CACHE_KEY);
      works = [];
      render();
    }
  });

  async function syncFromSupabase(initial){
    setSyncStatus('connecting…', false);
    saveDot.classList.add('saving');
    try{
      works = await loadUserData();
      localStorage.setItem(CACHE_KEY, JSON.stringify(works));
      localStorage.setItem(USERNAME_CACHE_KEY, currentUsername);
      setSyncStatus('synced · ' + timeNow(), false);
      render();
    }catch(e){
      const cached = localStorage.getItem(CACHE_KEY);
      if(cached){
        works = JSON.parse(cached);
        const cachedName = localStorage.getItem(USERNAME_CACHE_KEY);
        if(cachedName) currentUsername = cachedName;
        render();
        setSyncStatus('offline — showing last synced copy', true);
      } else {
        setSyncStatus('connection failed', true);
        if(initial) showConnectModal('Could not load your data. Check your connection and try again.');
      }
    }
  }

  function scheduleSave(){
    if(isDemo){ setSyncStatus('demo — not saved', false); return; }
    saveDot.classList.add('saving');
    saveText.textContent = 'syncing…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 500);
  }

  async function doSave(){
    if(isDemo) return;
    try{ localStorage.setItem(CACHE_KEY, JSON.stringify(works)); }catch(e){}
    if(!currentUser){ setSyncStatus('not signed in', true); return; }
    try{
      const { error } = await sb.from('folio_data').upsert({ user_id: currentUser.id, data: works, updated_at: new Date().toISOString() });
      if(error) throw error;
      setSyncStatus('synced · ' + timeNow(), false);
    }catch(e){
      setSyncStatus('sync failed — changes kept locally', true);
    }
  }

  function exportBackup(){
    const blob = new Blob([JSON.stringify(works, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const stamp = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    a.href = url; a.download = 'folio-backup-'+stamp+'.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function validateBackup(data){
    if(!Array.isArray(data)) throw new Error('Backup must contain an array of works.');
    data.forEach((w, i)=>{
      if(!w || typeof w !== 'object' || Array.isArray(w)) throw new Error('Invalid work at item '+(i+1)+'.');
      if(typeof w.id !== 'string' || !w.id.trim()) throw new Error('Missing work ID at item '+(i+1)+'.');
      if(typeof w.title !== 'string') throw new Error('Missing work title at item '+(i+1)+'.');
      if(!Array.isArray(w.trackers) || !Array.isArray(w.checklist)) throw new Error('Invalid tracker/checklist data at item '+(i+1)+'.');
      if(w.primary !== null && w.primary !== undefined && typeof w.primary !== 'object') throw new Error('Invalid primary tracker at item '+(i+1)+'.');
      if(w.activityDays !== undefined && (!Array.isArray(w.activityDays) || w.activityDays.some(d=>typeof d !== 'string'))) throw new Error('Invalid activity history at item '+(i+1)+'.');
    });
    return data;
  }

  function importBackup(file){
    const reader = new FileReader();
    reader.onload = (e)=>{
      try{
        const data = validateBackup(JSON.parse(e.target.result));
        if(works.length && !confirm('This will replace your current '+works.length+' item(s) with '+data.length+' from the backup. Continue?')) return;
        works = data;
        // Preserve older backups by reconstructing at least their last-known activity day.
        works.forEach(w=>{
          if(!Array.isArray(w.activityDays)) w.activityDays = [];
          if(!w.activityDays.length && w.updatedAt){
            const d = new Date(w.updatedAt);
            if(!Number.isNaN(d.getTime())) w.activityDays.push(dayKey(d));
          }
        });
        scheduleSave(); render();
      }catch(err){
        alert('Could not import this file. It is not a valid Folio backup.');
      }
    };
    reader.readAsText(file);
  }

  function dayKey(date){
    const d = date instanceof Date ? date : new Date(date);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }

  function touch(work){
    work.updatedAt = Date.now();
    if(!Array.isArray(work.activityDays)) work.activityDays = [];
    const today = dayKey(new Date());
    if(!work.activityDays.includes(today)) work.activityDays.push(today);
    // Keep a reasonable history while preventing unbounded growth.
    if(work.activityDays.length > 730) work.activityDays = work.activityDays.slice(-730);
  }

  function findWork(id){ return works.find(w=>w.id===id); }

  // ---------------- dashboard overview ----------------
  function updateDashboardStats(){
    const total = works.length;
    const completed = works.filter(isComplete).length;
    const inProgress = total - completed;
    const pct = total ? Math.round((completed / total) * 100) : 0;

    const totalEl = document.getElementById('statTotal');
    const completedEl = document.getElementById('statCompleted');
    const progressEl = document.getElementById('statProgress');
    const streakEl = document.getElementById('statStreak');
    if(!totalEl) return;

    totalEl.textContent = total;
    completedEl.textContent = completed;
    progressEl.textContent = inProgress;
    document.getElementById('statTotalNote').textContent =
      total === 1 ? '1 item in your workspace' : total + ' items in your workspace';
    document.getElementById('statCompletedNote').textContent =
      pct + '% completion rate';
    document.getElementById('statProgressNote').textContent =
      inProgress === 0 ? 'Everything is completed' :
      inProgress === 1 ? '1 item still being worked on' :
      inProgress + ' items still being worked on';

    // Study streak is based on persistent activity history. Older data falls
    // back to its last updatedAt value so existing work is not discarded.
    const days = new Set();
    works.forEach(w=>{
      if(Array.isArray(w.activityDays)) w.activityDays.forEach(d=>days.add(d));
      if(w.updatedAt && (!Array.isArray(w.activityDays) || !w.activityDays.length)){
        const d = new Date(w.updatedAt);
        if(!Number.isNaN(d.getTime())) days.add(dayKey(d));
      }
    });
    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0,0,0,0);
    while(days.has(dayKey(cursor))){
      streak++;
      cursor.setDate(cursor.getDate()-1);
    }
    streakEl.textContent = streak ? streak + 'd' : '—';
    document.getElementById('statStreakNote').textContent =
      streak ? (streak === 1 ? '1 day of recent activity' : streak + ' consecutive days of activity')
             : 'Start updating your work';
  }

  function getUserDisplayName(){
    if(currentUsername) return currentUsername;
    if(!currentUser || !currentUser.email) return 'there';
    const localPart = currentUser.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if(!localPart) return 'there';
    return localPart.split(' ').map(part=>part ? part.charAt(0).toUpperCase()+part.slice(1).toLowerCase() : '').join(' ');
  }

  function updateDashboardGreeting(){
    const el = document.getElementById('dashboardGreeting');
    if(!el) return;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    el.textContent = isDemo ? greeting + ' — here\'s a sample workspace.' : greeting + ', ' + getUserDisplayName() + '.';
  }

  updateDashboardGreeting();

  // ---------------- render ----------------
  function render(){
    updateDashboardGreeting();
    worksEl.innerHTML = '';
    if(works.length===0){
      worksEl.innerHTML = `
        <div class="empty-state">
          <h2>Nothing logged yet</h2>
          <p>Add your first course, textbook, or novel to begin the record.</p>
          <button class="btn btn-primary" id="emptyAddBtn">+ Add work</button>
        </div>`;
      document.getElementById('emptyAddBtn').onclick = openModal;
      updateDashboardStats();
      return;
    }
    getDisplayOrder().forEach(work => worksEl.appendChild(renderWork(work)));
    updateDashboardStats();
  }

  function isComplete(work){
    const hasAny = work.primary || work.trackers.length || work.checklist.length;
    if(!hasAny) return false;
    if(work.primary && work.primary.completed < work.primary.total) return false;
    if(work.trackers.some(t => t.completed < t.total)) return false;
    if(work.checklist.some(c => !c.done)) return false;
    return true;
  }

  function getDisplayOrder(){
    return works
      .map((w, i) => ({ w, i, c: isComplete(w) ? 1 : 0 }))
      .sort((a, b) => (a.c - b.c) || (a.i - b.i))
      .map(x => x.w);
  }

  function moveWork(id, dir){
    const display = getDisplayOrder();
    const idx = display.findIndex(w => w.id === id);
    const targetIdx = idx + dir;
    if(targetIdx < 0 || targetIdx >= display.length) return;
    // only reorder within the same completed/active group — completed items always stay at the bottom
    if(isComplete(display[idx]) !== isComplete(display[targetIdx])) return;
    const realA = works.findIndex(w => w.id === display[idx].id);
    const realB = works.findIndex(w => w.id === display[targetIdx].id);
    [works[realA], works[realB]] = [works[realB], works[realA]];
    scheduleSave(); render();
  }

  function renderWork(work){
    const card = document.createElement('div');
    card.className = 'work' + (work.trackers.length >= 2 ? ' span-2' : '');

    // top
    const top = document.createElement('div');
    top.className = 'work-top';
    top.innerHTML = `
      <div class="work-heading">
        <div class="eyebrow" contenteditable="true" data-field="category">${escapeHtml(work.category||'CUSTOM')}</div>
        <div class="work-title" contenteditable="true" data-field="title">${escapeHtml(work.title||'Untitled')}</div>
        <div class="work-subtitle" contenteditable="true" data-field="subtitle">${work.subtitle ? escapeHtml(work.subtitle) : ''}</div>
      </div>
      <div class="work-controls">
        <button class="icon-btn" data-action="move-up" title="Move up">▲</button>
        <button class="icon-btn" data-action="move-down" title="Move down">▼</button>
        <div style="position:relative;">
          <button class="icon-btn" data-action="menu">⋯</button>
          <div class="menu" data-menu>
            <button data-action="delete-work">Delete work</button>
          </div>
        </div>
      </div>`;
    card.appendChild(top);

    top.querySelector('[data-field="category"]').addEventListener('blur', e=>{
      work.category = e.target.textContent.trim().toUpperCase() || 'CUSTOM';
      touch(work); scheduleSave();
    });
    top.querySelector('[data-field="title"]').addEventListener('blur', e=>{
      work.title = e.target.textContent.trim() || 'Untitled';
      touch(work); scheduleSave();
    });
    const subtitleEl = top.querySelector('[data-field="subtitle"]');
    subtitleEl.setAttribute('data-placeholder', 'Add instructor, author, or notes');
    if(!work.subtitle) subtitleEl.classList.add('empty-hint');
    if(!work.subtitle) subtitleEl.textContent = '';
    subtitleEl.addEventListener('focus', e=>{ e.target.classList.remove('empty-hint'); });
    subtitleEl.addEventListener('blur', e=>{
      const v = e.target.textContent.trim();
      work.subtitle = v;
      if(!v){ e.target.classList.add('empty-hint'); e.target.textContent=''; }
      touch(work); scheduleSave();
    });

    top.querySelector('[data-action="move-up"]').addEventListener('click', ()=> moveWork(work.id, -1));
    top.querySelector('[data-action="move-down"]').addEventListener('click', ()=> moveWork(work.id, 1));

    if(isComplete(work)){
      const badge = document.createElement('span');
      badge.textContent = '✓ complete';
      badge.style.cssText = 'font-family:var(--font-mono);font-size:9px;color:var(--teal);white-space:nowrap;align-self:center;margin-right:4px;';
      top.querySelector('.work-controls').prepend(badge);
      card.classList.add('work-complete');
    }

    const menuBtn = top.querySelector('[data-action="menu"]');
    const menuEl = top.querySelector('[data-menu]');
    menuBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      document.querySelectorAll('.menu.open').forEach(m=>{ if(m!==menuEl) m.classList.remove('open'); });
      menuEl.classList.toggle('open');
    });
    top.querySelector('[data-action="delete-work"]').addEventListener('click', ()=>{
      if(confirm('Delete "'+work.title+'"? This cannot be undone.')){
        works = works.filter(w=>w.id!==work.id);
        scheduleSave(); render();
      }
    });

    // primary
    if(work.primary){
      card.appendChild(renderPrimary(work));
    }

    // trackers
    if(work.trackers.length){
      const trackWrap = document.createElement('div');
      trackWrap.className = 'trackers';
      work.trackers.forEach(t => trackWrap.appendChild(renderTracker(work, t)));
      card.appendChild(trackWrap);
    }

    // checklist
    if(work.checklist.length || work.showChecklist){
      const cl = document.createElement('div');
      cl.className = 'checklist';
      work.checklist.forEach(item => cl.appendChild(renderCheckItem(work, item)));
      const addRow = document.createElement('div');
      addRow.className = 'add-check-row';
      addRow.textContent = '+ Add checklist item';
      addRow.addEventListener('click', ()=>{
        const text = prompt('Item text (e.g. Read & understand)');
        if(!text) return;
        work.checklist.push({ id: uid(), text, done:false });
        touch(work); scheduleSave(); render();
      });
      cl.appendChild(addRow);
      card.appendChild(cl);
    }

    // quick add row — always offers "+ tracker"; conditionally offers progress/checklist
    const quick = document.createElement('div');
    quick.className = 'quick-add-row';

    const addTrackerBtn = document.createElement('button');
    addTrackerBtn.className = 'btn-mini-ghost';
    addTrackerBtn.textContent = '+ tracker';
    addTrackerBtn.addEventListener('click', ()=>{
      const name = prompt('Tracker name (e.g. Videos, Problem Sets, Exams)');
      if(!name) return;
      const unit = prompt('Unit label for one item (e.g. Video, Set, Exam)', name.replace(/s$/,'')) || name;
      const total = parseInt(prompt('Total count', '10')) || 1;
      work.trackers.push({
        id: uid(), name, unit, completed: 0, total,
        next: unit + ' 1', color: COLORS[work.trackers.length % COLORS.length]
      });
      touch(work); scheduleSave(); render();
    });
    quick.appendChild(addTrackerBtn);

    if(!work.primary){
      const b = document.createElement('button');
      b.className = 'btn-mini-ghost';
      b.textContent = '+ progress (e.g. chapters)';
      b.addEventListener('click', ()=>{
        const unit = prompt('What are you counting? (e.g. Chapter, Page)', 'Chapter');
        if(!unit) return;
        const total = parseInt(prompt('Total ' + unit.toLowerCase() + 's', '10')) || 1;
        work.primary = { unit, completed: 0, total, currentLabel: unit + ' 1' };
        touch(work); scheduleSave(); render();
      });
      quick.appendChild(b);
    }
    if(!work.checklist.length && !work.showChecklist){
      const b2 = document.createElement('button');
      b2.className = 'btn-mini-ghost';
      b2.textContent = '+ checklist';
      b2.addEventListener('click', ()=>{
        work.showChecklist = true;
        touch(work); scheduleSave(); render();
      });
      quick.appendChild(b2);
    }
    if(quick.children.length) card.appendChild(quick);

    return card;
  }

  function renderPrimary(work){
    const p = work.primary;
    const wrap = document.createElement('div');
    wrap.className = 'primary';
    const pct = Math.min(100, Math.round((p.completed / Math.max(p.total,1)) * 100));
    const remaining = Math.max(p.total - p.completed, 0);
    wrap.innerHTML = `
      <div class="primary-row">
        <div class="primary-label">Current · <input type="text" value="${escapeAttr(p.currentLabel)}" data-cur></div>
        <div class="primary-remaining">${remaining} ${escapeHtml(String(p.unit||'item').toLowerCase())}${remaining===1?'':'s'} remaining</div>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="primary-foot">
        <span>${p.completed} completed</span>
        <span style="margin-left:16px;">total: <input type="text" value="${p.total}" data-total style="width:36px;background:none;border:none;color:var(--text-faint);font-family:var(--font-mono);font-size:10.5px;outline:none;border-bottom:1px dashed var(--text-faint);"></span>
        <button class="mini-btn ghost done-btn" data-action="undo" ${p.completed<=0?'disabled':''} style="margin-left:auto;">Undo</button>
        <button class="mini-btn done-btn" ${p.completed>=p.total?'disabled':''} data-action="advance">${p.completed>=p.total?'Complete':'Done'}</button>
      </div>`;
    wrap.querySelector('[data-cur]').addEventListener('blur', e=>{
      p.currentLabel = e.target.value.trim(); touch(work); scheduleSave();
    });
    wrap.querySelector('[data-total]').addEventListener('blur', e=>{
      const v = parseInt(e.target.value); if(v>0){ p.total = v; touch(work); scheduleSave(); render(); }
    });
    const btn = wrap.querySelector('[data-action="advance"]');
    if(btn) btn.addEventListener('click', ()=>{
      const prevDefault = p.unit + ' ' + (p.completed+1);
      if(p.completed < p.total) p.completed += 1;
      if(p.currentLabel === (p.unit + ' ' + p.completed) || p.currentLabel === prevDefault || !p.currentLabel){
        p.currentLabel = p.unit + ' ' + Math.min(p.completed+1, p.total);
      }
      touch(work); scheduleSave(); render();
    });
    const undoBtn = wrap.querySelector('[data-action="undo"]');
    if(undoBtn) undoBtn.addEventListener('click', ()=>{
      if(p.completed<=0) return;
      const defaultLabel = p.unit + ' ' + (p.completed+1);
      p.completed -= 1;
      if(p.currentLabel === defaultLabel || !p.currentLabel){
        p.currentLabel = p.unit + ' ' + Math.min(p.completed+1, p.total);
      }
      touch(work); scheduleSave(); render();
    });
    return wrap;
  }

  function renderTracker(work, t){
    const el = document.createElement('div');
    el.className = 'tracker';
    const pct = Math.min(100, Math.round((t.completed / Math.max(t.total,1)) * 100));
    const remaining = Math.max(t.total - t.completed, 0);
    el.innerHTML = `
      <span class="del" data-action="del-tracker">✕</span>
      <div class="tracker-head">
        <span class="dot" style="background:${colorVar(t.color)}"></span>
        <span class="tracker-name" contenteditable="true" data-field="name">${escapeHtml(t.name)}</span>
        <span class="tracker-pct">${pct}%</span>
      </div>
      <div class="tracker-next" contenteditable="true" data-field="next">Next · ${escapeHtml(t.next||'')}</div>
      <div class="tracker-sub">${t.completed} completed</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${colorVar(t.color)}"></div></div>
      <div class="tracker-foot">
        <span class="tracker-sub" style="margin-right:auto;">${remaining} remaining</span>
        <button class="mini-btn ghost" data-action="undo" ${t.completed<=0?'disabled':''} style="margin-right:6px;">Undo</button>
        <button class="mini-btn" data-action="advance" ${t.completed>=t.total?'disabled':''}>${t.completed>=t.total?'Complete':'Done'}</button>
      </div>`;

    el.querySelector('[data-action="del-tracker"]').addEventListener('click', ()=>{
      work.trackers = work.trackers.filter(x=>x.id!==t.id);
      touch(work); scheduleSave(); render();
    });
    el.querySelector('[data-field="name"]').addEventListener('blur', e=>{
      t.name = e.target.textContent.trim() || t.name; touch(work); scheduleSave();
    });
    const nextEl = el.querySelector('[data-field="next"]');
    nextEl.addEventListener('focus', e=>{ e.target.textContent = t.next||''; });
    nextEl.addEventListener('blur', e=>{
      t.next = e.target.textContent.replace(/^Next\s*·\s*/,'').trim();
      touch(work); scheduleSave(); render();
    });
    const undoBtn = el.querySelector('[data-action="undo"]');
    if(undoBtn) undoBtn.addEventListener('click', ()=>{
      if(t.completed<=0) return;
      const defaultNext = t.unit + ' ' + (t.completed+1);
      t.completed -= 1;
      if(t.next === defaultNext || !t.next){
        t.next = t.unit + ' ' + (t.completed+1);
      }
      touch(work); scheduleSave(); render();
    });
    const advBtn = el.querySelector('[data-action="advance"]');
    if(advBtn) advBtn.addEventListener('click', ()=>{
      const prevDefault = t.unit + ' ' + (t.completed+1);
      if(t.completed < t.total) t.completed += 1;
      if(t.next === prevDefault || !t.next || t.next === (t.unit + ' ' + t.completed)){
        t.next = t.unit + ' ' + Math.min(t.completed+1, t.total);
      }
      touch(work); scheduleSave(); render();
    });
    return el;
  }

  function renderCheckItem(work, item){
    const row = document.createElement('div');
    row.className = 'check-row';
    row.innerHTML = `
      <div class="check-circle ${item.done?'done':''}" data-action="toggle"></div>
      <div class="check-text ${item.done?'done':''}" contenteditable="true" data-field="text">${escapeHtml(item.text)}</div>
      <button class="mini-btn ghost" data-action="toggle-btn">${item.done?'Undo':'Done'}</button>
      <span class="del" data-action="del-item">✕</span>`;
    const toggle = ()=>{ item.done = !item.done; touch(work); scheduleSave(); render(); };
    row.querySelector('[data-action="toggle"]').addEventListener('click', toggle);
    row.querySelector('[data-action="toggle-btn"]').addEventListener('click', toggle);
    row.querySelector('[data-field="text"]').addEventListener('blur', e=>{
      item.text = e.target.textContent.trim() || item.text; touch(work); scheduleSave();
    });
    row.querySelector('[data-action="del-item"]').addEventListener('click', ()=>{
      work.checklist = work.checklist.filter(x=>x.id!==item.id);
      touch(work); scheduleSave(); render();
    });
    return row;
  }

  function escapeHtml(s){
    return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s){ return escapeHtml(s); }

  // close menus when clicking elsewhere
  document.addEventListener('click', ()=>{
    document.querySelectorAll('.menu.open').forEach(m=>m.classList.remove('open'));
  });

  // ---------------- add work modal ----------------
  function openModal(){
    overlay.classList.add('open');
    document.getElementById('newTitle').value = '';
    document.getElementById('newSubtitle').value = '';
    document.getElementById('newCategory').value = 'COURSE';
    document.getElementById('newTitle').focus();
  }
  function closeModal(){ overlay.classList.remove('open'); }

  document.getElementById('addWorkBtn').addEventListener('click', openModal);
  document.getElementById('cancelAdd').addEventListener('click', closeModal);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });

  document.getElementById('confirmAdd').addEventListener('click', ()=>{
    const title = document.getElementById('newTitle').value.trim();
    if(!title){ document.getElementById('newTitle').focus(); return; }
    const category = document.getElementById('newCategory').value;
    const subtitle = document.getElementById('newSubtitle').value.trim();
    works.unshift({
      id: uid(), category, title, subtitle,
      primary: null, trackers: [], checklist: [], showChecklist:false,
      createdAt: Date.now(), updatedAt: Date.now()
    });
    scheduleSave(); render(); closeModal();
  });

  document.getElementById('newTitle').addEventListener('keydown', e=>{
    if(e.key==='Enter') document.getElementById('confirmAdd').click();
  });

  document.getElementById('exportBtn').addEventListener('click', exportBackup);
  document.getElementById('importBtn').addEventListener('click', ()=>{
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', e=>{
    const file = e.target.files[0];
    if(file) importBackup(file);
    e.target.value = '';
  });

  // ---------------- Supabase sign-in / demo / account ----------------
  document.getElementById('sendLinkBtn').addEventListener('click', async ()=>{
    const email = document.getElementById('emailInput').value.trim();
    const errEl = document.getElementById('connectError');
    errEl.style.display = 'none';
    if(!email || !email.includes('@')){ errEl.textContent = 'Enter a valid email.'; errEl.style.display = 'block'; return; }

    const btn = document.getElementById('sendLinkBtn');
    btn.disabled = true; btn.textContent = 'Sending…';
    try{
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href }
      });
      if(error) throw error;
      document.getElementById('sentToEmail').textContent = email;
      document.getElementById('signinStage').style.display = 'none';
      document.getElementById('checkEmailStage').style.display = 'block';
    }catch(e){
      errEl.textContent = 'Could not send the link — check the email and try again.';
      errEl.style.display = 'block';
    }
    btn.disabled = false; btn.textContent = 'Send sign-in link';
  });

  document.getElementById('backToSigninBtn').addEventListener('click', ()=>{
    document.getElementById('signinStage').style.display = 'block';
    document.getElementById('checkEmailStage').style.display = 'none';
  });

  document.getElementById('demoBtn').addEventListener('click', enterDemoMode);
  document.getElementById('exitDemoBtn').addEventListener('click', exitDemoMode);

  document.getElementById('settingsBtn').addEventListener('click', ()=>{
    if(isDemo){ exitDemoMode(); return; }
    if(!currentUser){ showConnectModal(); return; }
    document.getElementById('accountEmailDisplay').value = currentUser.email || '';
    document.getElementById('accountUsernameInput').value = currentUsername || '';
    document.getElementById('usernameSaveMsg').style.display = 'none';
    document.getElementById('settingsOverlay').classList.add('open');
  });
  document.getElementById('saveUsernameBtn').addEventListener('click', async ()=>{
    if(!currentUser) return;
    const btn = document.getElementById('saveUsernameBtn');
    const msgEl = document.getElementById('usernameSaveMsg');
    const raw = document.getElementById('accountUsernameInput').value.trim();
    if(raw.length > 60){
      msgEl.textContent = 'Keep it under 60 characters.';
      msgEl.style.color = 'var(--rose)';
      msgEl.style.display = 'block';
      return;
    }
    btn.disabled = true; btn.textContent = 'Saving…';
    try{
      const { error } = await sb.from('folio_data').update({ username: raw || null }).eq('user_id', currentUser.id);
      if(error) throw error;
      currentUsername = raw;
      localStorage.setItem(USERNAME_CACHE_KEY, currentUsername);
      document.getElementById('accountUsernameInput').value = currentUsername;
      updateDashboardGreeting();
      msgEl.textContent = 'Saved.';
      msgEl.style.color = 'var(--teal)';
      msgEl.style.display = 'block';
    }catch(e){
      msgEl.textContent = 'Could not save — check your connection and try again.';
      msgEl.style.color = 'var(--rose)';
      msgEl.style.display = 'block';
    }
    btn.disabled = false; btn.textContent = 'Save name';
  });
  document.getElementById('closeSettingsBtn').addEventListener('click', ()=>{
    document.getElementById('settingsOverlay').classList.remove('open');
  });
  document.getElementById('settingsOverlay').addEventListener('click', e=>{
    if(e.target.id === 'settingsOverlay') document.getElementById('settingsOverlay').classList.remove('open');
  });
  document.getElementById('disconnectBtn').addEventListener('click', async ()=>{
    if(!confirm('Sign out on this device? Your data stays safe in your account — sign back in anytime with your email.')) return;
    await sb.auth.signOut();
    works = [];
    currentUsername = '';
    localStorage.removeItem(USERNAME_CACHE_KEY);
    document.getElementById('settingsOverlay').classList.remove('open');
    render();
    setSyncStatus('not signed in', true);
    showConnectModal();
  });

  init();
})();
