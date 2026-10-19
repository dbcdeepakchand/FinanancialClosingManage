import React, { useMemo, useState, useEffect } from 'react';
import {
  LayoutDashboard, ListChecks, Building2, CalendarDays, ChartNoAxesCombined,
  Bell, Search, ChevronDown, ChevronRight, CheckCircle2, Circle, Clock3,
  AlertTriangle, ArrowUpRight, ArrowDownRight, Plus, Download, Filter,
  MoreHorizontal, FileSpreadsheet, CircleHelp, Settings, PanelLeftClose,
  PanelLeft, Check, X, ClipboardCheck, ShieldCheck, Sparkles, RefreshCw,
  CalendarRange, UserRound, Activity, CircleAlert, Eye, FileText, Menu
} from 'lucide-react';

const entities = [
  { id:'TE-IN', name:'Technip Energies India', country:'India', region:'Asia Pacific', currency:'INR', controller:'Ananya Sharma' },
  { id:'TE-FR', name:'Technip Energies France', country:'France', region:'Europe', currency:'EUR', controller:'Camille Martin' },
  { id:'TE-UK', name:'Technip Energies UK', country:'United Kingdom', region:'Europe', currency:'GBP', controller:'Oliver Reed' },
  { id:'TE-US', name:'Technip Energies USA', country:'United States', region:'Americas', currency:'USD', controller:'Sarah Johnson' },
  { id:'TE-DE', name:'Technip Energies Germany', country:'Germany', region:'Europe', currency:'EUR', controller:'Lukas Weber' },
  { id:'TE-NL', name:'Technip Energies Netherlands', country:'Netherlands', region:'Europe', currency:'EUR', controller:'Sophie de Vries' },
  { id:'TE-IT', name:'Technip Energies Italy', country:'Italy', region:'Europe', currency:'EUR', controller:'Giulia Romano' },
  { id:'TE-AE', name:'Technip Energies UAE', country:'United Arab Emirates', region:'Middle East', currency:'AED', controller:'Omar Hassan' },
  { id:'TE-SA', name:'Technip Energies Saudi Arabia', country:'Saudi Arabia', region:'Middle East', currency:'SAR', controller:'Faisal Ahmed' },
  { id:'TE-MY', name:'Technip Energies Malaysia', country:'Malaysia', region:'Asia Pacific', currency:'MYR', controller:'Nur Aisyah' },
  { id:'TE-SG', name:'Technip Energies Singapore', country:'Singapore', region:'Asia Pacific', currency:'SGD', controller:'Wei Ming Tan' },
  { id:'TE-AU', name:'Technip Energies Australia', country:'Australia', region:'Asia Pacific', currency:'AUD', controller:'Emily Parker' }
];

const initialTasks = [
  { id:1, title:'Confirm close calendar and period status', module:'General Ledger', frequency:'Both', owner:'GL Team', due:1, priority:'High', status:'Complete', entity:'TE-IN', note:'Calendar confirmed' },
  { id:2, title:'Complete accounts payable processing', module:'Accounts Payable', frequency:'Both', owner:'AP Team', due:2, priority:'High', status:'Complete', entity:'TE-IN', note:'' },
  { id:3, title:'Complete accounts receivable and billing', module:'Accounts Receivable', frequency:'Both', owner:'AR Team', due:2, priority:'High', status:'In progress', entity:'TE-IN', note:'Two billing exceptions under review' },
  { id:4, title:'Complete bank reconciliation', module:'Cash Management', frequency:'Both', owner:'Treasury', due:3, priority:'High', status:'Complete', entity:'TE-IN', note:'' },
  { id:5, title:'Complete expense and employee advance accounting', module:'Expenses', frequency:'Both', owner:'Expenses Team', due:3, priority:'Medium', status:'Complete', entity:'TE-IN', note:'' },
  { id:6, title:'Complete project cost and revenue accounting', module:'Project Accounting', frequency:'Both', owner:'Project Finance', due:4, priority:'High', status:'In progress', entity:'TE-IN', note:'Pending project cost import' },
  { id:7, title:'Review intercompany transactions and reconcile balances', module:'Intercompany', frequency:'Both', owner:'Intercompany Team', due:4, priority:'High', status:'Not started', entity:'TE-IN', note:'' },
  { id:8, title:'Run depreciation and review fixed assets', module:'Fixed Assets', frequency:'Both', owner:'FA Team', due:4, priority:'Medium', status:'Not started', entity:'TE-IN', note:'' },
  { id:9, title:'Post accruals, provisions and recurring journals', module:'General Ledger', frequency:'Both', owner:'GL Team', due:4, priority:'High', status:'Not started', entity:'TE-IN', note:'' },
  { id:10, title:'Review trial balance and account reconciliations', module:'General Ledger', frequency:'Both', owner:'GL Team', due:5, priority:'High', status:'Not started', entity:'TE-IN', note:'' },
  { id:11, title:'Validate subledger-to-GL reconciliation', module:'General Ledger', frequency:'Both', owner:'GL Team', due:5, priority:'High', status:'Not started', entity:'TE-IN', note:'' },
  { id:12, title:'Review unaccounted transactions and transfer exceptions', module:'Accounting', frequency:'Both', owner:'ERP Support', due:5, priority:'Medium', status:'Not started', entity:'TE-IN', note:'' },
  { id:13, title:'Review quarterly tax provisions and balances', module:'Tax', frequency:'Quarterly', owner:'Tax Team', due:6, priority:'High', status:'In progress', entity:'TE-IN', note:'' },
  { id:14, title:'Review project margin, WIP and revenue estimates', module:'Project Accounting', frequency:'Quarterly', owner:'Project Finance', due:6, priority:'High', status:'Not started', entity:'TE-IN', note:'' },
  { id:15, title:'Perform balance sheet substantiation and certification', module:'General Ledger', frequency:'Quarterly', owner:'Entity Controller', due:7, priority:'High', status:'Not started', entity:'TE-IN', note:'' },
  { id:16, title:'Review FX revaluation and foreign currency balances', module:'General Ledger', frequency:'Quarterly', owner:'GL Team', due:7, priority:'Medium', status:'Not started', entity:'TE-IN', note:'' },
  { id:17, title:'Complete intercompany confirmations and differences review', module:'Intercompany', frequency:'Quarterly', owner:'Intercompany Team', due:7, priority:'High', status:'Not started', entity:'TE-IN', note:'' },
  { id:18, title:'Review financial statements and management reporting', module:'Reporting', frequency:'Quarterly', owner:'Entity Controller', due:8, priority:'High', status:'Not started', entity:'TE-IN', note:'' }
];

const navItems = [
  { id:'dashboard', label:'Dashboard', icon:LayoutDashboard },
  { id:'checklist', label:'Close checklist', icon:ListChecks },
  { id:'entities', label:'Legal entities', icon:Building2 },
  { id:'calendar', label:'Close calendar', icon:CalendarDays },
  { id:'reports', label:'Reports & analytics', icon:ChartNoAxesCombined }
];

function seedTasks() {
  const out = [];
  entities.forEach((entity, i) => {
    initialTasks.forEach((task, j) => {
      if (task.frequency === 'Quarterly' || task.frequency === 'Both') {
        let status = task.status;
        if (entity.id !== 'TE-IN') {
          status = ((i * 3 + j * 5) % 11 === 0) ? 'Complete' :
                   ((i + j) % 7 === 0) ? 'In progress' : 'Not started';
        }
        out.push({ ...task, id:`${entity.id}-${task.id}`, templateId:task.id, entity:entity.id, status,
          note: entity.id === 'TE-IN' ? task.note : '' });
      }
    });
  });
  return out;
}

const initialSeed = seedTasks();

async function apiRequest(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

function StatusPill({status}) {
  const cls = status === 'Complete' ? 'complete' : status === 'In progress' ? 'progress' : status === 'Blocked' ? 'blocked' : 'pending';
  return <span className={`status-pill ${cls}`}><span className="status-dot"/>{status}</span>;
}

function Progress({value, color='blue'}) {
  return <div className="progress-track"><div className={`progress-fill ${color}`} style={{width:`${value}%`}} /></div>;
}

function StatCard({label,value,sub,icon:Icon,tone,trend}) {
  return <div className="stat-card">
    <div className="stat-top"><span className="stat-label">{label}</span><span className={`stat-icon ${tone}`}><Icon size={18}/></span></div>
    <div className="stat-value">{value}</div>
    <div className="stat-bottom">{trend && <span className={`trend ${trend.startsWith('+')?'up':'down'}`}>{trend.startsWith('+')?<ArrowUpRight size={13}/>:<ArrowDownRight size={13}/>} {trend}</span>}<span>{sub}</span></div>
  </div>;
}

export default function App() {
  const [tasks,setTasks] = useState([]);
  const [loading,setLoading] = useState(true);
  const [apiError,setApiError] = useState('');
  const [reloadCount,setReloadCount] = useState(0);
  const [saving,setSaving] = useState(false);
  const [period,setPeriod] = useState('Monthly');
  const [month,setMonth] = useState('October 2026');
  const [page,setPage] = useState('dashboard');
  const [selectedEntity,setSelectedEntity] = useState('ALL');
  const [search,setSearch] = useState('');
  const [statusFilter,setStatusFilter] = useState('All statuses');
  const [moduleFilter,setModuleFilter] = useState('All modules');
  const [showAdd,setShowAdd] = useState(false);
  const [toast,setToast] = useState('');
  const [mobileNav,setMobileNav] = useState(false);
  const [newTask,setNewTask] = useState({title:'',module:'General Ledger',owner:'GL Team',due:5,priority:'Medium',frequency:'Both',entity:'TE-IN'});
  const [detailTask,setDetailTask] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loadTasks = async () => {
      setLoading(true);
      setApiError('');
      try {
        let loadedTasks = await apiRequest('/tasks');
        if (loadedTasks.length === 0) {
          loadedTasks = await apiRequest('/tasks/initialize', {
            method: 'POST',
            body: JSON.stringify({ tasks: initialSeed })
          });
        }
        if (!cancelled) setTasks(loadedTasks);
      } catch (error) {
        if (!cancelled) setApiError(`Could not load tasks from Oracle: ${error.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadTasks();
    return () => { cancelled = true; };
  }, [reloadCount]);

  useEffect(() => { if(toast) { const timer=setTimeout(()=>setToast(''),3200); return ()=>clearTimeout(timer); } },[toast]);

  const applicable = useMemo(() => tasks.filter(t => t.frequency === 'Both' || t.frequency === period), [tasks,period]);
  const visibleTasks = useMemo(() => applicable.filter(t =>
    (selectedEntity === 'ALL' || t.entity === selectedEntity) &&
    (statusFilter === 'All statuses' || t.status === statusFilter) &&
    (moduleFilter === 'All modules' || t.module === moduleFilter) &&
    (t.title + t.module + t.owner + t.entity).toLowerCase().includes(search.toLowerCase())
  ),[applicable,selectedEntity,statusFilter,moduleFilter,search]);

  const completedCount = applicable.filter(t=>t.status==='Complete').length;
  const inProgressCount = applicable.filter(t=>t.status==='In progress').length;
  const blockedCount = applicable.filter(t=>t.status==='Blocked').length;
  const pendingCount = applicable.filter(t=>t.status==='Not started').length;
  const completion = applicable.length ? Math.round(completedCount/applicable.length*100) : 0;
  const entityStats = entities.map(e=>{
    const list = applicable.filter(t=>t.entity===e.id);
    const done = list.filter(t=>t.status==='Complete').length;
    const inProgress = list.filter(t=>t.status==='In progress').length;
    const blocked = list.filter(t=>t.status==='Blocked').length;
    return {...e,total:list.length,done,inProgress,blocked,pending:list.length-done-inProgress-blocked,pct:list.length?Math.round(done/list.length*100):0};
  });
  const fullyClosed = entityStats.filter(e=>e.total>0 && e.done===e.total).length;
  const highPriorityOpen = applicable.filter(t=>t.priority==='High' && t.status!=='Complete').length;
  const modules = [...new Set(applicable.map(t=>t.module))].sort();

  const updateTask = (id,patch) => {
    setDetailTask(prev=>prev && prev.id===id?{...prev,...patch}:prev);
  };

  const saveTask = async () => {
    setSaving(true);
    setApiError('');
    try {
      const savedTask = await apiRequest(`/tasks/${encodeURIComponent(detailTask.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          entity: detailTask.entity,
          status: detailTask.status,
          owner: detailTask.owner,
          due: detailTask.due,
          note: detailTask.note || ''
        })
      });
      setTasks(prev=>prev.map(task=>task.id===savedTask.id?savedTask:task));
      setDetailTask(null);
      setToast('Task changes saved to Oracle.');
    } catch (error) {
      setApiError(`Could not save task: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const rows = [['Entity ID','Entity','Period','Task','Module','Owner','Due close day','Priority','Status','Comment']];
    visibleTasks.forEach(t=>{
      const e=entities.find(x=>x.id===t.entity);
      rows.push([t.entity,e?.name||'',period,t.title,t.module,t.owner,t.due,t.priority,t.status,t.note||'']);
    });
    const csv = rows.map(row=>row.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`finance-close-${period.toLowerCase()}-checklist.csv`; a.click(); URL.revokeObjectURL(url);
    setToast('Checklist exported to CSV');
  };

  const addTask = async (e) => {
    e.preventDefault();
    if(!newTask.title.trim()) return;
    const targets = newTask.entity === 'ALL' ? entities : entities.filter(x=>x.id===newTask.entity);
    const additions = targets.map((entity,idx)=>({
      ...newTask,id:`custom-${Date.now()}-${idx}`,templateId:null,entity:entity.id,
      title:newTask.title.trim(),due:Number(newTask.due),status:'Not started',note:'',frequency:newTask.frequency
    }));
    setSaving(true);
    setApiError('');
    try {
      const savedTasks = await apiRequest('/tasks', {
        method: 'POST',
        body: JSON.stringify({ tasks: additions })
      });
      setTasks(prev=>[...prev,...savedTasks]);
      setShowAdd(false);
      setNewTask({title:'',module:'General Ledger',owner:'GL Team',due:5,priority:'Medium',frequency:'Both',entity:'TE-IN'});
      setToast(`Task created for ${targets.length} ${targets.length===1?'entity':'entities'} in Oracle.`);
    } catch (error) {
      setApiError(`Could not create task: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const pageTitle = navItems.find(n=>n.id===page)?.label || 'Dashboard';
  const selectedEntityName = selectedEntity==='ALL' ? 'All legal entities' : entities.find(e=>e.id===selectedEntity)?.name;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav?'mobile-open':''}`}>
      <div className="brand">
        <div className="brand-mark"><Activity size={22}/></div>
        <div className="brand-copy"><strong>Enterprise<span>Finance</span></strong><small>CLOSE OPERATIONS</small></div>
        <button className="icon-btn sidebar-collapse" aria-label="Close navigation" onClick={()=>setMobileNav(false)}><PanelLeftClose size={17}/></button>
      </div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="nav-list">
        {navItems.map(item=><button key={item.id} className={`nav-item ${page===item.id?'active':''}`} onClick={()=>{setPage(item.id);setMobileNav(false);}}>
          <item.icon size={18}/><span>{item.label}</span>{item.id==='checklist'&&<span className="nav-count">{pendingCount}</span>}
        </button>)}
      </nav>
      <div className="sidebar-section">
        <div className="sidebar-section-head"><span>PERIOD</span><CalendarRange size={14}/></div>
        <button className={`period-option ${period==='Monthly'?'selected':''}`} onClick={()=>setPeriod('Monthly')}><span className="period-radio"/><span>Monthly close</span></button>
        <button className={`period-option ${period==='Quarterly'?'selected':''}`} onClick={()=>setPeriod('Quarterly')}><span className="period-radio"/><span>Quarterly close</span></button>
      </div>
      <div className="sidebar-spacer"/>
      <div className="sidebar-help">
        <div className="help-icon"><CircleHelp size={18}/></div>
        <p>View the close process guide and checklist standards.</p>
        <button onClick={()=>setToast('Connect your internal close process guide to enable this link.')}>Open guide <ArrowUpRight size={13}/></button>
      </div>
      <div className="sidebar-user">
        <div className="avatar">FC</div><div className="user-copy"><strong>Finance Controller</strong><small>Group Finance · Admin</small></div><MoreHorizontal size={18} className="muted"/>
      </div>
    </aside>

    {mobileNav && <div className="mobile-backdrop" onClick={()=>setMobileNav(false)}/>}
    <main className="main-area">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-btn mobile-menu" onClick={()=>setMobileNav(true)}><Menu size={20}/></button><span className="breadcrumb">Finance Operations</span><ChevronRight size={14}/><strong>{pageTitle}</strong></div>
        <div className="topbar-right">
          <div className="period-select"><CalendarDays size={16}/><select value={month} onChange={e=>setMonth(e.target.value)} aria-label="Reporting period"><option>October 2026</option><option>September 2026</option><option>August 2026</option><option>Q3 2026</option><option>Q2 2026</option></select><ChevronDown size={14}/></div>
          <button className="icon-btn notification-btn" title="Notifications" onClick={()=>setToast(`${highPriorityOpen} high-priority tasks remain open.`)}><Bell size={18}/><i/></button>
          <div className="top-avatar">DBC</div>
        </div>
      </header>

      {apiError && <div className="api-error" role="alert"><span>{apiError}</span><button className="btn secondary compact" onClick={()=>setReloadCount(count=>count+1)} disabled={loading}>Retry</button></div>}
      {loading && <div className="api-loading" role="status">Connecting to Oracle and loading close tasks…</div>}
      <div className="page-content">
        {page==='dashboard' && <Dashboard
          period={period} month={month} completion={completion} completedCount={completedCount}
          inProgressCount={inProgressCount} blockedCount={blockedCount} pendingCount={pendingCount}
          fullyClosed={fullyClosed} highPriorityOpen={highPriorityOpen} entityStats={entityStats}
          applicable={applicable} onGoChecklist={()=>setPage('checklist')} onSelectEntity={id=>{setSelectedEntity(id);setPage('checklist');}}
          onViewEntities={()=>setPage('entities')} onOpenTask={t=>setDetailTask(t)}
        />}

        {page==='checklist' && <section className="page-section">
          <div className="page-heading"><div><div className="eyebrow">CLOSE EXECUTION</div><h1>Close checklist</h1><p>Track activities, ownership and completion across every legal entity.</p></div><button className="btn primary" onClick={()=>setShowAdd(true)}><Plus size={16}/> Add task</button></div>
          <div className="inline-summary"><div><span className="summary-dot green"/><strong>{completedCount}</strong><span>Complete</span></div><div><span className="summary-dot blue"/><strong>{inProgressCount}</strong><span>In progress</span></div><div><span className="summary-dot amber"/><strong>{pendingCount}</strong><span>Not started</span></div><div><span className="summary-dot red"/><strong>{blockedCount}</strong><span>Blocked</span></div></div>
          <div className="table-card">
            <div className="table-toolbar"><div className="search-box"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tasks, owners, entities..."/></div><div className="toolbar-filters"><select value={selectedEntity} onChange={e=>setSelectedEntity(e.target.value)}><option value="ALL">All legal entities</option>{entities.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option>All statuses</option><option>Not started</option><option>In progress</option><option>Blocked</option><option>Complete</option></select><select value={moduleFilter} onChange={e=>setModuleFilter(e.target.value)}><option>All modules</option>{modules.map(m=><option key={m}>{m}</option>)}</select><button className="btn secondary compact" onClick={exportCsv}><Download size={15}/> Export</button></div></div>
            <div className="table-scroll"><table><thead><tr><th>Activity</th><th>Legal entity</th><th>Owner</th><th>Due</th><th>Priority</th><th>Status</th><th></th></tr></thead><tbody>
              {visibleTasks.map(t=><tr key={t.id} onClick={()=>setDetailTask(t)} className="clickable-row"><td><div className="task-name">{t.status==='Complete'?<CheckCircle2 size={16} className="task-check done"/>:<Circle size={16} className="task-check"/>}<div><strong>{t.title}</strong><small>{t.module}</small></div></div></td><td><span className="entity-code">{t.entity}</span><span className="entity-short">{entities.find(e=>e.id===t.entity)?.name}</span></td><td><span className="owner-name"><span className="mini-avatar">{t.owner.split(' ').map(s=>s[0]).join('').slice(0,2)}</span>{t.owner}</span></td><td><span className="due-text">Day {t.due}</span></td><td><span className={`priority ${t.priority.toLowerCase()}`}>{t.priority}</span></td><td><StatusPill status={t.status}/></td><td><button className="row-more" onClick={e=>{e.stopPropagation();setDetailTask(t)}}><ChevronRight size={17}/></button></td></tr>)}
              {visibleTasks.length===0&&<tr><td colSpan="7" className="empty-state">No tasks match your filters.</td></tr>}
            </tbody></table></div>
            <div className="table-footer"><span>Showing <strong>{visibleTasks.length}</strong> of {applicable.length} applicable tasks</span><span>Period: <strong>{period}</strong> · {month}</span></div>
          </div>
        </section>}

        {page==='entities' && <section className="page-section">
          <div className="page-heading"><div><div className="eyebrow">ENTITY OVERSIGHT</div><h1>Legal entities</h1><p>One view of closing readiness across your group.</p></div><button className="btn secondary" onClick={exportCsv}><Download size={16}/> Export overview</button></div>
          <div className="entity-grid">{entityStats.map(e=><button key={e.id} className="entity-card" onClick={()=>{setSelectedEntity(e.id);setPage('checklist');}}>
            <div className="entity-card-top"><div className="entity-symbol"><Building2 size={19}/></div><span className="entity-code">{e.id}</span><ChevronRight size={16}/></div>
            <h3>{e.name}</h3><p>{e.country} · {e.currency}</p><div className="entity-progress-label"><span>Close completion</span><strong>{e.pct}%</strong></div><Progress value={e.pct} color={e.pct===100?'green':'blue'}/><div className="entity-card-bottom"><span><CheckCircle2 size={14}/>{e.done} complete</span><span><Clock3 size={14}/>{e.pending+e.inProgress+e.blocked} open</span></div><div className="controller-line"><UserRound size={14}/> Controller: {e.controller}</div>
          </button>)}</div>
        </section>}

        {page==='calendar' && <section className="page-section">
          <div className="page-heading"><div><div className="eyebrow">CLOSE TIMELINE</div><h1>Close calendar</h1><p>Illustrative close-day milestones for {month}.</p></div><button className="btn secondary" onClick={()=>setToast('Calendar export can be connected to your enterprise calendar.') }><CalendarDays size={16}/> Export calendar</button></div>
          <div className="calendar-banner"><div className="calendar-banner-icon"><CalendarRange size={23}/></div><div><strong>{month} · {period} close</strong><p>Use these milestones as a planning baseline. Configure actual business-day calendars and local holidays during implementation.</p></div></div>
          <div className="timeline">{[
            ['Day 1','Open the close','Confirm period status, communicate close calendar and verify readiness.','General Ledger'],
            ['Day 2','Subledger completion','Complete AP, AR billing and transaction processing.','AP / AR'],
            ['Day 3','Cash and expenses','Complete bank reconciliations, expenses and advances.','Cash Management'],
            ['Day 4','Project and intercompany','Complete project accounting, fixed assets and intercompany review.','Projects / GL'],
            ['Day 5','Journals and trial balance','Post accruals, review journals and validate balances.','General Ledger'],
            ...(period==='Quarterly'?[['Day 6–7','Quarter-end reviews','Complete tax, WIP, FX and balance sheet certification.','Tax / Projects'],['Day 8','Reporting and sign-off','Review financial statements and obtain controller sign-off.','Reporting']]:[])
          ].map((m,i)=><div className="timeline-item" key={m[0]}><div className={`timeline-marker ${i===0?'current':''}`}>{i+1}</div><div className="timeline-content"><div className="timeline-top"><span className="timeline-day">{m[0]}</span><span className="module-chip">{m[3]}</span></div><h3>{m[1]}</h3><p>{m[2]}</p></div></div>)}</div>
        </section>}

        {page==='reports' && <section className="page-section">
          <div className="page-heading"><div><div className="eyebrow">PERFORMANCE & INSIGHTS</div><h1>Reports & analytics</h1><p>Review progress, workload and close execution risks.</p></div><button className="btn primary" onClick={exportCsv}><Download size={16}/> Export report</button></div>
          <div className="stats-grid"><StatCard label="Overall completion" value={`${completion}%`} sub={`${completedCount} of ${applicable.length} activities`} icon={ChartNoAxesCombined} tone="blue"/><StatCard label="Entities fully closed" value={`${fullyClosed} / ${entities.length}`} sub="Across current cycle" icon={ShieldCheck} tone="green"/><StatCard label="High-priority open" value={highPriorityOpen} sub="Needs active monitoring" icon={AlertTriangle} tone="amber"/><StatCard label="Blocked tasks" value={blockedCount} sub="Requires intervention" icon={CircleAlert} tone="red"/></div>
          <div className="reports-grid"><div className="panel"><div className="panel-heading"><div><h2>Entity completion</h2><p>Completion rate by legal entity</p></div><span className="panel-icon"><ChartNoAxesCombined size={18}/></span></div><div className="bar-chart">{entityStats.map(e=><div className="bar-row" key={e.id}><span title={e.name}>{e.id}</span><div className="bar-bg"><div className="bar-fill" style={{width:`${e.pct}%`}}/></div><strong>{e.pct}%</strong></div>)}</div></div>
          <div className="panel"><div className="panel-heading"><div><h2>Task status mix</h2><p>Current {period.toLowerCase()} close</p></div><span className="panel-icon"><Activity size={18}/></span></div><div className="status-breakdown"><div className="donut-wrap"><div className="donut" style={{background:`conic-gradient(#1b9875 0 ${completedCount/Math.max(applicable.length,1)*100}%, #4b88d2 ${completedCount/Math.max(applicable.length,1)*100}% ${(completedCount+inProgressCount)/Math.max(applicable.length,1)*100}%, #d99a2b ${(completedCount+inProgressCount)/Math.max(applicable.length,1)*100}% ${(completedCount+inProgressCount+pendingCount)/Math.max(applicable.length,1)*100}%, #d75d5d ${(completedCount+inProgressCount+pendingCount)/Math.max(applicable.length,1)*100}% 100%)`}}><div className="donut-hole"><strong>{completion}%</strong><span>Complete</span></div></div></div><div className="legend">{[['Complete',completedCount,'green'],['In progress',inProgressCount,'blue'],['Not started',pendingCount,'amber'],['Blocked',blockedCount,'red']].map(([label,count,color])=><div className="legend-item" key={label}><span className={`legend-dot ${color}`}/><span>{label}</span><strong>{count}</strong></div>)}</div></div></div></div>
          <div className="panel attention-panel"><div className="panel-heading"><div><h2>Priority attention list</h2><p>High-priority activities not yet completed</p></div><button className="text-btn" onClick={()=>setPage('checklist')}>View checklist <ArrowUpRight size={14}/></button></div><div className="attention-list">{applicable.filter(t=>t.priority==='High'&&t.status!=='Complete').slice(0,7).map(t=><button key={t.id} className="attention-item" onClick={()=>setDetailTask(t)}><span className="attention-alert"><AlertTriangle size={16}/></span><span className="attention-copy"><strong>{t.title}</strong><small>{t.entity} · {t.owner}</small></span><StatusPill status={t.status}/><ChevronRight size={16}/></button>)}</div></div>
        </section>}
      </div>
      <footer className="app-footer"><span>CloseControl <span className="footer-dot">•</span> Finance Close & Project Accounting Control Tower</span></footer>
    </main>

    {detailTask && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDetailTask(null)}}><div className="detail-drawer">
      <div className="drawer-head"><div><div className="eyebrow">TASK DETAILS</div><h2>Close activity</h2></div><button className="icon-btn" onClick={()=>setDetailTask(null)}><X size={19}/></button></div>
      <div className="drawer-body">
        {apiError && <p className="form-error" role="alert">{apiError}</p>}
        <span className="module-chip">{detailTask.module}</span><h3 className="drawer-task-title">{detailTask.title}</h3><div className="drawer-status-row"><StatusPill status={detailTask.status}/><span className={`priority ${detailTask.priority.toLowerCase()}`}>{detailTask.priority} priority</span></div>
        <label className="field-label">Legal entity</label><select className="field-control" value={detailTask.entity} onChange={e=>updateTask(detailTask.id,{entity:e.target.value})}>{entities.map(e=><option value={e.id} key={e.id}>{e.name}</option>)}</select>
        <label className="field-label">Task status</label><select className="field-control" value={detailTask.status} onChange={e=>updateTask(detailTask.id,{status:e.target.value})}><option>Not started</option><option>In progress</option><option>Blocked</option><option>Complete</option></select>
        <label className="field-label">Owner / team</label><input className="field-control" value={detailTask.owner} onChange={e=>updateTask(detailTask.id,{owner:e.target.value})}/>
        <label className="field-label">Due close day</label><input type="number" min="1" max="31" className="field-control" value={detailTask.due} onChange={e=>updateTask(detailTask.id,{due:Number(e.target.value)})}/>
        <label className="field-label">Comments / blockers</label><textarea className="field-control textarea" rows="4" placeholder="Add progress notes, blockers or handover comments..." value={detailTask.note||''} onChange={e=>updateTask(detailTask.id,{note:e.target.value})}/>
        <div className="drawer-note"><ShieldCheck size={16}/><span>Production version should record who changed the task, when it changed, and approval evidence in an immutable audit trail.</span></div>
      </div>
      <div className="drawer-footer"><button className="btn secondary" onClick={()=>setDetailTask(null)}>Cancel</button><button className="btn primary" onClick={saveTask} disabled={saving}><Check size={16}/>{saving?'Saving…':'Save changes'}</button></div>
    </div></div>}

    {showAdd && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowAdd(false)}}><form className="add-modal" onSubmit={addTask}>
      <div className="drawer-head"><div><div className="eyebrow">CHECKLIST CONFIGURATION</div><h2>Add close activity</h2></div><button type="button" className="icon-btn" onClick={()=>setShowAdd(false)}><X size={19}/></button></div>
      {apiError && <p className="form-error modal-error" role="alert">{apiError}</p>}
      <div className="form-grid">
        <div className="form-field full"><label>Activity name *</label><input required autoFocus value={newTask.title} onChange={e=>setNewTask({...newTask,title:e.target.value})} placeholder="e.g. Review manual journal entries"/></div>
        <div className="form-field"><label>Module</label><select value={newTask.module} onChange={e=>setNewTask({...newTask,module:e.target.value})}>{['General Ledger','Accounts Payable','Accounts Receivable','Cash Management','Expenses','Fixed Assets','Project Accounting','Intercompany','Tax','Reporting','Accounting'].map(m=><option key={m}>{m}</option>)}</select></div>
        <div className="form-field"><label>Owner / team</label><input value={newTask.owner} onChange={e=>setNewTask({...newTask,owner:e.target.value})}/></div>
        <div className="form-field"><label>Due close day</label><input type="number" min="1" max="31" value={newTask.due} onChange={e=>setNewTask({...newTask,due:e.target.value})}/></div>
        <div className="form-field"><label>Priority</label><select value={newTask.priority} onChange={e=>setNewTask({...newTask,priority:e.target.value})}><option>High</option><option>Medium</option><option>Low</option></select></div>
        <div className="form-field"><label>Close frequency</label><select value={newTask.frequency} onChange={e=>setNewTask({...newTask,frequency:e.target.value})}><option value="Both">Monthly and quarterly</option><option value="Monthly">Monthly only</option><option value="Quarterly">Quarterly only</option></select></div>
        <div className="form-field"><label>Apply to</label><select value={newTask.entity} onChange={e=>setNewTask({...newTask,entity:e.target.value})}><option value="ALL">All 12 entities</option>{entities.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
      </div>
      <div className="modal-actions"><button type="button" className="btn secondary" onClick={()=>setShowAdd(false)}>Cancel</button><button type="submit" className="btn primary" disabled={saving}><Plus size={16}/>{saving?'Saving…':'Create task'}</button></div>
    </form></div>}
    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}<button onClick={()=>setToast('')}><X size={15}/></button></div>}
  </div>;
}

function Dashboard(props) {
  const {period,month,completion,completedCount,inProgressCount,blockedCount,pendingCount,fullyClosed,highPriorityOpen,entityStats,applicable,onGoChecklist,onSelectEntity,onViewEntities,onOpenTask}=props;
  const openTasks=applicable.filter(t=>t.status!=='Complete');
  const attention=applicable.filter(t=>t.status==='Blocked'||(t.priority==='High'&&t.status!=='Complete')).slice(0,5);
  return <section className="page-section">
    <div className="welcome-row"><div><div className="eyebrow">GROUP FINANCE / CLOSE MANAGEMENT</div><h1>Good morning, Deepak Chand <span className="wave">✦</span></h1><p>Here’s your close readiness overview for <strong>{month}</strong>.</p></div><div className="welcome-actions"><span className="period-badge"><CalendarRange size={15}/>{period} close</span><button className="btn primary" onClick={onGoChecklist}><ListChecks size={16}/> Open checklist</button></div></div>
    <div className="callout"><div className="callout-icon"><Sparkles size={19}/></div><div className="callout-copy"><strong>Close overview</strong><p>{completion}% of applicable activities are complete across {entityStats.length} legal entities. <b>{highPriorityOpen} high-priority tasks</b> remain open and should be reviewed.</p></div><button className="callout-link" onClick={onGoChecklist}>Review tasks <ArrowUpRight size={14}/></button></div>
    <div className="stats-grid">
      <StatCard label="Group close completion" value={`${completion}%`} sub={`${completedCount} of ${applicable.length} tasks complete`} icon={ChartNoAxesCombined} tone="blue" trend="+8%"/>
      <StatCard label="Entities fully closed" value={`${fullyClosed} / ${entityStats.length}`} sub="All applicable tasks complete" icon={ShieldCheck} tone="green"/>
      <StatCard label="Open activities" value={openTasks.length.toLocaleString()} sub={`${inProgressCount} currently in progress`} icon={Clock3} tone="amber"/>
      <StatCard label="High-priority open" value={highPriorityOpen} sub={`${blockedCount} blocked activities`} icon={AlertTriangle} tone="red"/>
    </div>
    <div className="dashboard-grid">
      <div className="panel entity-overview">
        <div className="panel-heading"><div><h2>Legal entity overview</h2><p>Close progress by entity</p></div><button className="text-btn" onClick={onViewEntities}>View all entities <ArrowUpRight size={14}/></button></div>
        <div className="entity-table"><div className="entity-table-head"><span>ENTITY</span><span>PROGRESS</span><span>STATUS</span></div>
          {entityStats.slice(0,7).map(e=><button className="entity-table-row" key={e.id} onClick={()=>onSelectEntity(e.id)}><div className="entity-cell"><div className="entity-mini-icon"><Building2 size={16}/></div><div><strong>{e.name}</strong><small>{e.country} · {e.id}</small></div></div><div className="entity-progress-cell"><div className="entity-progress-text"><strong>{e.pct}%</strong><small>{e.done}/{e.total} tasks</small></div><Progress value={e.pct} color={e.pct===100?'green':'blue'}/></div><div className="entity-status-cell">{e.pct===100?<StatusPill status="Complete"/>:e.blocked>0?<StatusPill status="Blocked"/>:<StatusPill status={e.inProgress>0?'In progress':'Not started'}/>}</div></button>)}
        </div><button className="panel-bottom-link" onClick={onViewEntities}>View all 12 legal entities <ChevronRight size={15}/></button>
      </div>
      <div className="panel attention-panel">
        <div className="panel-heading"><div><h2>Needs attention</h2><p>Priority tasks to review</p></div><span className="attention-count">{attention.length}</span></div>
        {attention.length===0?<div className="no-attention"><CheckCircle2 size={27}/><strong>Nothing urgent</strong><p>No high-priority open activities in this view.</p></div>:<div className="attention-list">{attention.map(t=><button className="attention-item" key={t.id} onClick={()=>onOpenTask(t)}><span className={`attention-alert ${t.status==='Blocked'?'red':''}`}><AlertTriangle size={16}/></span><span className="attention-copy"><strong>{t.title}</strong><small>{t.entity} · Day {t.due} · {t.owner}</small></span><ChevronRight size={16}/></button>)}</div>}
        <button className="panel-bottom-link" onClick={onGoChecklist}>View all open activities <ChevronRight size={15}/></button>
      </div>
    </div>
    <div className="bottom-grid">
      <div className="panel"><div className="panel-heading"><div><h2>Close progress</h2><p>Overall activity status</p></div><span className="panel-icon"><Activity size={18}/></span></div><div className="big-progress"><div className="big-progress-value">{completion}%</div><div className="big-progress-copy"><strong>Activities completed</strong><span>{completedCount} completed out of {applicable.length} tasks</span></div></div><Progress value={completion} color="green"/><div className="status-metrics"><div><span className="legend-dot green"/><span>Complete</span><strong>{completedCount}</strong></div><div><span className="legend-dot blue"/><span>In progress</span><strong>{inProgressCount}</strong></div><div><span className="legend-dot amber"/><span>Not started</span><strong>{pendingCount}</strong></div><div><span className="legend-dot red"/><span>Blocked</span><strong>{blockedCount}</strong></div></div></div>
      <div className="panel"><div className="panel-heading"><div><h2>Close milestones</h2><p>Illustrative schedule · {period}</p></div><span className="panel-icon"><CalendarDays size={18}/></span></div><div className="milestone-list">{[['Day 1','Period readiness','Confirm close calendar'],['Day 2–3','Subledger completion','AP, AR, cash and expenses'],['Day 4–5','Accounting and review','Projects, intercompany, journals'],...(period==='Quarterly'?[['Day 6–8','Quarter-end sign-off','Tax, balance sheet and reporting']]:[])].map((m,i)=><div className="milestone" key={m[0]}><div className={`milestone-check ${i===0?'done':''}`}>{i===0?<Check size={13}/>:i+1}</div><div className="milestone-copy"><strong>{m[1]}</strong><small>{m[2]}</small></div><span className="milestone-day">{m[0]}</span></div>)}</div></div>
    </div>
  </section>;
}
