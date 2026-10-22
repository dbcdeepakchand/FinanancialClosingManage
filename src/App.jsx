import React, { useMemo, useState, useEffect } from 'react';
import {
  LayoutDashboard, ListChecks, Building2, CalendarDays, ChartNoAxesCombined,
  Bell, Search, ChevronRight, CheckCircle2, Circle, Clock3, AlertTriangle,
  ArrowUpRight, Download, Upload, MoreHorizontal, FileSpreadsheet, CircleHelp,
  PanelLeftClose, Check, X, ShieldCheck, Sparkles, CalendarRange, Activity,
  CircleAlert, Menu
} from 'lucide-react';

const uploadTemplates = {
  checklist: {
    label: 'Operational checklist',
    fileName: 'operational-checklist-template.csv',
    tableName: 'XX_OPERATIONAL_CHECKLIST',
    required: 'CHECKLIST_ROW_ID, STEP_DESCRIPTION',
    columns: [
      'CHECKLIST_ROW_ID', 'CHECKLIST_NO', 'SUM_SEQ', 'MODULE_NAME', 'PROCESS_OWNER',
      'STEP_ID', 'PRE_REQUISITE_ID', 'PRE_REQUISITE_DESC', 'STEP_DESCRIPTION',
      'STEP_COMMENT', 'ACTION_BY', 'WORKDAYS', 'TARGET_DATE', 'TPIT', 'TPIDL',
      'TENITALYPS', 'BUSINESS_UNIT', 'USER_ROLE', 'ASSIGNED_USER', 'COMPLETION_CHECK',
      'EXPECTED_OUTCOME', 'ACTION_TYPE', 'PROCESS_TYPE', 'NAVIGATION_PATH',
      'ACTION_ITEM_DETAILS', 'EXPECTED_START_TIME', 'EXPECTED_COMP_TIME', 'SUSPENSION_STATUS'
    ]
  },
  mapping: {
    label: 'Business unit / ledger map',
    fileName: 'business-unit-ledger-template.csv',
    tableName: 'XX_BU_LE_LEDGER_MAPPING',
    required: 'BUSINESS_UNIT_ID, BUSINESS_UNIT_NAME, LEGAL_ENTITY_ID, LEGAL_ENTITY_NAME, LEDGER_ID, LEDGER_NAME',
    columns: [
      'BUSINESS_UNIT_ID', 'BUSINESS_UNIT_NAME', 'LEGAL_ENTITY_ID', 'LEGAL_ENTITY_NAME',
      'LEDGER_ID', 'LEDGER_NAME', 'CURRENCY_CODE'
    ]
  }
};

const navItems = [
  { id:'dashboard', label:'Dashboard', icon:LayoutDashboard },
  { id:'checklist', label:'Close checklist', icon:ListChecks },
  { id:'entities', label:'Business units', icon:Building2 },
  { id:'calendar', label:'Close calendar', icon:CalendarDays },
  { id:'reports', label:'Reports & analytics', icon:ChartNoAxesCombined }
];

function formatWorkdays(value) {
  if (value === null || value === undefined || value === '') return 'Not set';
  const days = Number(value);
  if (!Number.isFinite(days)) return String(value);
  if (days < 0) return `${Math.abs(days)} workdays before close`;
  if (days > 0) return `${days} workdays after close`;
  return 'Close day';
}

function parseCsv(text, expectedColumns) {
  const records = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"' && value.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(value);
      value = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value);
      if (row.some(cell => cell.trim() !== '')) records.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted field.');
  row.push(value);
  if (row.some(cell => cell.trim() !== '')) records.push(row);
  if (records.length === 0) throw new Error('The CSV is empty.');

  const headers = records[0].map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim()
  );
  if (headers.length !== expectedColumns.length ||
      new Set(headers).size !== expectedColumns.length ||
      expectedColumns.some(column => !headers.includes(column))) {
    throw new Error('The header row does not match the selected data-source template.');
  }

  const rows = records.slice(1).map((cells, index) => {
    if (cells.length !== headers.length) {
      throw new Error(`Row ${index + 2} has ${cells.length} columns; expected ${headers.length}.`);
    }
    return Object.fromEntries(headers.map((header, columnIndex) => [header, cells[columnIndex].trim()]));
  });
  if (rows.length === 0) throw new Error('Add at least one data row below the template headers.');
  if (rows.length > 5000) throw new Error('Upload is limited to 5,000 rows at a time.');
  return rows;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });

  const contentType = response.headers.get('content-type') || '';
  const rawText = await response.text();
  let result;

  if (rawText) {
    const trimmed = rawText.trim();
    if (trimmed.startsWith('<')) {
      throw new Error('Oracle API is unavailable or returned an HTML page instead of JSON. Start the API server and retry.');
    }

    try {
      result = JSON.parse(trimmed);
    } catch (error) {
      const fallback = contentType.includes('application/json') ? 'The Oracle response was not valid JSON.' : 'The Oracle API returned an unexpected response.';
      throw new Error(fallback);
    }
  }

  if (!response.ok) {
    const message = result?.error ||
      (response.status >= 500 && !rawText
        ? 'The API server did not respond. In development, start it with `npm run api` in a separate terminal and configure Oracle settings in `.env`.'
        : `Request failed (${response.status})`);
    throw new Error(message);
  }

  return result;
}

function StatusPill({status}) {
  const cls = status === 'Complete' ? 'complete' : status === 'In progress' ? 'progress' : status === 'Blocked' ? 'blocked' : 'pending';
  return <span className={`status-pill ${cls}`}><span className="status-dot"/>{status}</span>;
}

function Progress({value, color='blue'}) {
  return <div className="progress-track"><div className={`progress-fill ${color}`} style={{width:`${value}%`}} /></div>;
}

function StatCard({label,value,sub,icon:Icon,tone}) {
  return <div className="stat-card">
    <div className="stat-top"><span className="stat-label">{label}</span><span className={`stat-icon ${tone}`}><Icon size={18}/></span></div>
    <div className="stat-value">{value}</div>
    <div className="stat-bottom"><span>{sub}</span></div>
  </div>;
}

export default function App() {
  const [tasks,setTasks] = useState([]);
  const [entities,setEntities] = useState([]);
  const [loading,setLoading] = useState(true);
  const [apiError,setApiError] = useState('');
  const [reloadCount,setReloadCount] = useState(0);
  const [saving,setSaving] = useState(false);
  const [page,setPage] = useState('dashboard');
  const [selectedEntity,setSelectedEntity] = useState('ALL');
  const [search,setSearch] = useState('');
  const [statusFilter,setStatusFilter] = useState('All statuses');
  const [moduleFilter,setModuleFilter] = useState('All modules');
  const [toast,setToast] = useState('');
  const [mobileNav,setMobileNav] = useState(false);
  const [detailTask,setDetailTask] = useState(null);
  const [dataSource,setDataSource] = useState('checklist');
  const [uploadRows,setUploadRows] = useState([]);
  const [uploadFileName,setUploadFileName] = useState('');
  const [uploadError,setUploadError] = useState('');
  const [uploading,setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadTasks = async () => {
      setLoading(true);
      setApiError('');
      try {
        const data = await apiRequest('/tasks');
        if (!Array.isArray(data.tasks) || !Array.isArray(data.entities)) {
          throw new Error('Oracle returned an unexpected checklist or business-unit response.');
        }
        if (!cancelled) {
          setTasks(data.tasks);
          setEntities(data.entities);
        }
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

  const applicable = tasks;
  const visibleTasks = useMemo(() => applicable.filter(t =>
    (selectedEntity === 'ALL' || t.businessUnitId === selectedEntity) &&
    (statusFilter === 'All statuses' || t.status === statusFilter) &&
    (moduleFilter === 'All modules' || t.module === moduleFilter) &&
    [t.title,t.stepId,t.module,t.owner,t.entity,t.legalEntityName,t.ledgerName]
      .filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase())
  ),[applicable,selectedEntity,statusFilter,moduleFilter,search]);

  const completedCount = applicable.filter(t=>t.status==='Complete').length;
  const inProgressCount = applicable.filter(t=>t.status==='In progress').length;
  const blockedCount = applicable.filter(t=>t.status==='Blocked').length;
  const pendingCount = applicable.filter(t=>t.status==='Not started').length;
  const completion = applicable.length ? Math.round(completedCount/applicable.length*100) : 0;
  const entityStats = entities.map(e=>{
    const list = applicable.filter(t=>t.businessUnitId===e.id);
    const done = list.filter(t=>t.status==='Complete').length;
    const inProgress = list.filter(t=>t.status==='In progress').length;
    const blocked = list.filter(t=>t.status==='Blocked').length;
    return {...e,total:list.length,done,inProgress,blocked,pending:list.length-done-inProgress-blocked,pct:list.length?Math.round(done/list.length*100):0};
  });
  const fullyClosed = entityStats.filter(e=>e.total>0 && e.done===e.total).length;
  const modules = [...new Set(applicable.map(t=>t.module))].sort();
  const checklistRows = [...new Map(applicable.map(task=>[task.checklistRowId,task])).values()]
    .sort((a,b)=>Number(a.checklistNo)-Number(b.checklistNo) || Number(a.sequence)-Number(b.sequence));

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
          status: detailTask.status,
          owner: detailTask.owner,
          note: detailTask.note || ''
        })
      });
      setTasks(prev=>prev.map(task=>task.id===savedTask.id?{...task,...savedTask}:task));
      setDetailTask(null);
      setToast('Task changes saved to Oracle.');
    } catch (error) {
      setApiError(`Could not save task: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const downloadUploadTemplate = () => {
    const template = uploadTemplates[dataSource];
    const csv = template.columns.map(value => `"${value}"`).join(',');
    const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = template.fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const selectUploadFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setUploadRows([]);
    setUploadFileName('');
    setUploadError('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('Choose a CSV file created from the supported template.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('The CSV file must be 5 MB or smaller.');
      return;
    }
    try {
      const rows = parseCsv(await file.text(), uploadTemplates[dataSource].columns);
      setUploadRows(rows);
      setUploadFileName(file.name);
    } catch (error) {
      setUploadError(error.message);
    }
  };

  const submitUpload = async () => {
    setUploading(true);
    setUploadError('');
    try {
      const result = await apiRequest(`/imports/${dataSource}`, {
        method: 'POST',
        body: JSON.stringify({rows: uploadRows})
      });
      setUploadRows([]);
      setUploadFileName('');
      setToast(`${result.inserted} rows inserted into Oracle.`);
      setReloadCount(count => count + 1);
    } catch (error) {
      setUploadError(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const exportCsv = () => {
    const rows = [['Checklist row ID','Checklist no','Sequence','Step ID','Prerequisite ID','Module','Activity','Business unit ID','Business unit','Source business unit','Legal entity ID','Legal entity','Ledger ID','Ledger','Currency','Process owner','Assigned owner','Action by','Workdays','Target date','TPIT','TPIDL','TENITALYPS','User role','Action type','Process type','Navigation path','Action details','Expected start time','Expected completion time','Suspension status','Completion check','Expected outcome','Status','Comment']];
    visibleTasks.forEach(t=>{
      rows.push([t.checklistRowId,t.checklistNo,t.sequence,t.stepId,t.prerequisiteId,t.module,t.title,t.businessUnitId,t.entity,t.entityScope,t.legalEntityId,t.legalEntityName,t.ledgerId,t.ledgerName,t.currency,t.processOwner,t.owner,t.actionBy,formatWorkdays(t.due),t.targetDate,t.tpit,t.tpidl,t.tenItalyPs,t.userRole,t.actionType,t.processType,t.navigationPath,t.actionDetails,t.expectedStartTime,t.expectedCompletionTime,t.suspensionStatus,t.completionCheck,t.expectedOutcome,t.status,t.note||'']);
    });
    const csv = rows.map(row=>row.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='operational-checklist.csv'; a.click(); URL.revokeObjectURL(url);
    setToast('Checklist exported to CSV');
  };

  const pageTitle = page === 'dataSource' ? 'Data source' : navItems.find(n=>n.id===page)?.label || 'Dashboard';

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
        <div className="sidebar-section-head"><span>DATA SOURCE</span><FileSpreadsheet size={14}/></div>
        {Object.entries(uploadTemplates).map(([key,template])=><button key={key} className={`period-option ${page==='dataSource'&&dataSource===key?'selected':''}`} onClick={()=>{setDataSource(key);setPage('dataSource');setUploadRows([]);setUploadFileName('');setUploadError('');setMobileNav(false);}}>
          <span className="period-radio"/><span>{template.label}</span>
        </button>)}
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
          <span className="period-badge"><FileSpreadsheet size={15}/> Oracle source</span>
          <button className="icon-btn notification-btn" title="Blocked tasks" onClick={()=>setToast(`${blockedCount} activities are blocked.`)}><Bell size={18}/><i/></button>
          <div className="top-avatar">DBC</div>
        </div>
      </header>

      {apiError && <div className="api-error" role="alert"><span>{apiError}</span><button className="btn secondary compact" onClick={()=>setReloadCount(count=>count+1)} disabled={loading}>Retry</button></div>}
      {loading && <div className="api-loading" role="status">Connecting to Oracle and loading close tasks…</div>}
      <div className="page-content">
        {page==='dashboard' && <Dashboard
          completion={completion} completedCount={completedCount}
          inProgressCount={inProgressCount} blockedCount={blockedCount} pendingCount={pendingCount}
          fullyClosed={fullyClosed} unscheduledCount={applicable.filter(t=>t.due===null||t.due===undefined||t.due==='').length} entityStats={entityStats}
          applicable={applicable} onGoChecklist={()=>setPage('checklist')} onSelectEntity={id=>{setSelectedEntity(id);setPage('checklist');}}
          onViewEntities={()=>setPage('entities')} onOpenTask={t=>setDetailTask(t)}
        />}

        {page==='checklist' && <section className="page-section">
          <div className="page-heading"><div><div className="eyebrow">CLOSE EXECUTION</div><h1>Operational checklist</h1><p>Checklist activities expanded across the business units in the BU / ledger mapping.</p></div><button className="btn secondary" onClick={exportCsv}><Download size={16}/> Export</button></div>
          <div className="inline-summary"><div><span className="summary-dot green"/><strong>{completedCount}</strong><span>Complete</span></div><div><span className="summary-dot blue"/><strong>{inProgressCount}</strong><span>In progress</span></div><div><span className="summary-dot amber"/><strong>{pendingCount}</strong><span>Not started</span></div><div><span className="summary-dot red"/><strong>{blockedCount}</strong><span>Blocked</span></div></div>
          <div className="table-card">
            <div className="table-toolbar"><div className="search-box"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search activities, owners, units..."/></div><div className="toolbar-filters"><select value={selectedEntity} onChange={e=>setSelectedEntity(e.target.value)}><option value="ALL">All business units</option>{entities.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option>All statuses</option><option>Not started</option><option>In progress</option><option>Blocked</option><option>Complete</option></select><select value={moduleFilter} onChange={e=>setModuleFilter(e.target.value)}><option>All modules</option>{modules.map(m=><option key={m}>{m}</option>)}</select></div></div>
            <div className="table-scroll"><table><thead><tr><th>Activity</th><th>Business unit / legal entity</th><th>Process owner</th><th>Workdays</th><th>Status</th><th></th></tr></thead><tbody>
              {visibleTasks.map(t=><tr key={t.id} onClick={()=>setDetailTask(t)} className="clickable-row"><td><div className="task-name">{t.status==='Complete'?<CheckCircle2 size={16} className="task-check done"/>:<Circle size={16} className="task-check"/>}<div><strong>{t.title}</strong><small>{t.stepId} · {t.module}</small></div></div></td><td><span className="entity-code">{t.entity}</span><span className="entity-short">{t.legalEntityName}</span></td><td><span className="owner-name"><span className="mini-avatar">{t.owner.split(' ').map(s=>s[0]).join('').slice(0,2)}</span>{t.owner}</span></td><td><span className="due-text">{formatWorkdays(t.due)}</span></td><td><StatusPill status={t.status}/></td><td><button className="row-more" onClick={e=>{e.stopPropagation();setDetailTask(t)}}><ChevronRight size={17}/></button></td></tr>)}
              {visibleTasks.length===0&&<tr><td colSpan="6" className="empty-state">No tasks match your filters.</td></tr>}
            </tbody></table></div>
            <div className="table-footer"><span>Showing <strong>{visibleTasks.length}</strong> of {applicable.length} checklist / business-unit instances</span><span>Source checklist rows: <strong>{new Set(applicable.map(t=>t.checklistRowId)).size}</strong></span></div>
          </div>
        </section>}

        {page==='entities' && <section className="page-section">
          <div className="page-heading"><div><div className="eyebrow">BUSINESS UNIT OVERSIGHT</div><h1>Business units</h1><p>Mapped business units with their legal entities, ledgers and checklist completion.</p></div><button className="btn secondary" onClick={exportCsv}><Download size={16}/> Export overview</button></div>
          <div className="entity-grid">{entityStats.map(e=><button key={e.id} className="entity-card" onClick={()=>{setSelectedEntity(e.id);setPage('checklist');}}>
            <div className="entity-card-top"><div className="entity-symbol"><Building2 size={19}/></div><span className="entity-code">{e.currency}</span><ChevronRight size={16}/></div>
            <h3>{e.name}</h3><p>{e.legalEntityName}</p><div className="entity-progress-label"><span>Close completion</span><strong>{e.pct}%</strong></div><Progress value={e.pct} color={e.pct===100?'green':'blue'}/><div className="entity-card-bottom"><span><CheckCircle2 size={14}/>{e.done} complete</span><span><Clock3 size={14}/>{e.pending+e.inProgress+e.blocked} open</span></div><div className="controller-line"><Building2 size={14}/> {e.ledgerName} · {e.currency}</div>
          </button>)}</div>
        </section>}

        {page==='calendar' && <section className="page-section">
          <div className="page-heading"><div><div className="eyebrow">SOURCE SCHEDULE</div><h1>Checklist timing</h1><p>Schedule details are taken directly from the operational checklist extract.</p></div><button className="btn secondary" onClick={exportCsv}><Download size={16}/> Export schedule</button></div>
          <div className="calendar-banner"><div className="calendar-banner-icon"><CalendarRange size={23}/></div><div><strong>{checklistRows.length} operational checklist steps</strong><p>Workday offsets and expected run times reflect the source checklist. Blank WORKDAYS values are shown as not set.</p></div></div>
          <div className="timeline">{checklistRows.map((task,index)=><div className="timeline-item" key={task.checklistRowId}>
            <div className={`timeline-marker ${index===0?'current':''}`}>{index+1}</div>
            <div className="timeline-content"><div className="timeline-top"><span className="timeline-day">{formatWorkdays(task.due)}</span><span className="module-chip">{task.module}</span></div>
              <h3>{task.stepId} · {task.title}</h3><p>{task.note || task.actionDetails || task.navigationPath || 'No additional schedule details in the source checklist.'}</p>
              {(task.expectedStartTime || task.expectedCompletionTime) && <p>Expected: {[task.expectedStartTime,task.expectedCompletionTime].filter(Boolean).join(' – ')}</p>}
            </div>
          </div>)}</div>
        </section>}

        {page==='reports' && <section className="page-section">
          <div className="page-heading"><div><div className="eyebrow">PERFORMANCE & INSIGHTS</div><h1>Reports & analytics</h1><p>Review progress, workload and close execution risks.</p></div><button className="btn primary" onClick={exportCsv}><Download size={16}/> Export report</button></div>
          <div className="stats-grid"><StatCard label="Overall completion" value={`${completion}%`} sub={`${completedCount} of ${applicable.length} activities`} icon={ChartNoAxesCombined} tone="blue"/><StatCard label="Business units fully closed" value={`${fullyClosed} / ${entities.length}`} sub="All mapped checklist rows complete" icon={ShieldCheck} tone="green"/><StatCard label="Activities without timing" value={applicable.filter(t=>t.due===null||t.due===undefined||t.due==='').length} sub="WORKDAYS not set in source" icon={CalendarRange} tone="amber"/><StatCard label="Blocked tasks" value={blockedCount} sub="Requires intervention" icon={CircleAlert} tone="red"/></div>
          <div className="reports-grid"><div className="panel"><div className="panel-heading"><div><h2>Business unit completion</h2><p>Completion rate by mapped BU</p></div><span className="panel-icon"><ChartNoAxesCombined size={18}/></span></div><div className="bar-chart">{entityStats.map(e=><div className="bar-row" key={e.id}><span title={e.name}>{e.name}</span><div className="bar-bg"><div className="bar-fill" style={{width:`${e.pct}%`}}/></div><strong>{e.pct}%</strong></div>)}</div></div>
          <div className="panel"><div className="panel-heading"><div><h2>Task status mix</h2><p>Current operational checklist instances</p></div><span className="panel-icon"><Activity size={18}/></span></div><div className="status-breakdown"><div className="donut-wrap"><div className="donut" style={{background:`conic-gradient(#1b9875 0 ${completedCount/Math.max(applicable.length,1)*100}%, #4b88d2 ${completedCount/Math.max(applicable.length,1)*100}% ${(completedCount+inProgressCount)/Math.max(applicable.length,1)*100}%, #d99a2b ${(completedCount+inProgressCount)/Math.max(applicable.length,1)*100}% ${(completedCount+inProgressCount+pendingCount)/Math.max(applicable.length,1)*100}%, #d75d5d ${(completedCount+inProgressCount+pendingCount)/Math.max(applicable.length,1)*100}% 100%)`}}><div className="donut-hole"><strong>{completion}%</strong><span>Complete</span></div></div></div><div className="legend">{[['Complete',completedCount,'green'],['In progress',inProgressCount,'blue'],['Not started',pendingCount,'amber'],['Blocked',blockedCount,'red']].map(([label,count,color])=><div className="legend-item" key={label}><span className={`legend-dot ${color}`}/><span>{label}</span><strong>{count}</strong></div>)}</div></div></div></div>
          <div className="panel attention-panel"><div className="panel-heading"><div><h2>Blocked activities</h2><p>Activities currently marked blocked</p></div><button className="text-btn" onClick={()=>setPage('checklist')}>View checklist <ArrowUpRight size={14}/></button></div><div className="attention-list">{applicable.filter(t=>t.status==='Blocked').slice(0,7).map(t=><button key={t.id} className="attention-item" onClick={()=>setDetailTask(t)}><span className="attention-alert red"><AlertTriangle size={16}/></span><span className="attention-copy"><strong>{t.title}</strong><small>{t.entity} · {t.owner}</small></span><StatusPill status={t.status}/><ChevronRight size={16}/></button>)}</div></div>
        </section>}

        {page==='dataSource' && <section className="page-section">
          <div className="page-heading"><div><div className="eyebrow">ORACLE SOURCE DATA</div><h1>{uploadTemplates[dataSource].label}</h1><p>Upload a CSV to insert source records directly into the Oracle table used by the application.</p></div><button className="btn secondary" onClick={downloadUploadTemplate}><Download size={16}/> Download template</button></div>
          <div className="upload-card">
            <div className="upload-card-icon"><FileSpreadsheet size={21}/></div>
            <div className="upload-card-copy"><h2>Upload source data</h2><p>Oracle table: <code>{uploadTemplates[dataSource].tableName}</code></p><p>Use the downloaded CSV template and keep its column headers unchanged. Required fields: {uploadTemplates[dataSource].required}. Empty cells are imported as null.</p></div>
            <div className="upload-controls">
              <label className="btn secondary upload-file-label"><Upload size={16}/> Choose CSV<input type="file" accept=".csv,text/csv" onChange={selectUploadFile}/></label>
              <button className="btn primary" onClick={submitUpload} disabled={!uploadRows.length||uploading}><Upload size={16}/>{uploading?'Uploading…':`Insert ${uploadRows.length||''} rows`}</button>
            </div>
            <p className="upload-guidance">CSV only · Up to 5,000 rows and 5 MB per upload. Uploads append rows; existing records are not replaced. Duplicate keys or invalid Oracle values reject the entire upload.</p>
            {uploadFileName && <div className="upload-file-status"><CheckCircle2 size={16}/><span><strong>{uploadFileName}</strong> · {uploadRows.length} rows ready to insert</span></div>}
            {uploadError && <p className="form-error upload-error" role="alert">{uploadError}</p>}
          </div>
        </section>}
      </div>
      <footer className="app-footer"><span>CloseControl <span className="footer-dot">•</span> Finance Close & Project Accounting Control Tower</span></footer>
    </main>

    {detailTask && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDetailTask(null)}}><div className="detail-drawer">
      <div className="drawer-head"><div><div className="eyebrow">TASK DETAILS</div><h2>Close activity</h2></div><button className="icon-btn" onClick={()=>setDetailTask(null)}><X size={19}/></button></div>
      <div className="drawer-body">
        {apiError && <p className="form-error" role="alert">{apiError}</p>}
        <span className="module-chip">{detailTask.module}</span><h3 className="drawer-task-title">{detailTask.title}</h3><div className="drawer-status-row"><StatusPill status={detailTask.status}/></div>
        <p className="field-label">Step {detailTask.stepId} · Checklist {detailTask.checklistNo}</p>
        <label className="field-label">Business unit</label><p>{detailTask.entity}</p>
        <label className="field-label">Legal entity / ledger</label><p>{detailTask.legalEntityName} · {detailTask.ledgerName} ({detailTask.currency})</p>
        <label className="field-label">Checklist timing</label><p>{formatWorkdays(detailTask.due)}</p>
        {detailTask.processOwner && <><label className="field-label">Source process owner</label><p>{detailTask.processOwner}</p></>}
        {detailTask.actionBy && <><label className="field-label">Action by</label><p>{detailTask.actionBy}</p></>}
        {detailTask.targetDate && <><label className="field-label">Target date</label><p>{detailTask.targetDate}</p></>}
        {detailTask.entityScope && <><label className="field-label">Source business unit</label><p>{detailTask.entityScope}</p></>}
        {[['TPIT',detailTask.tpit],['TPIDL',detailTask.tpidl],['TENITALYPS',detailTask.tenItalyPs]].some(([,value])=>value) && <><label className="field-label">Business unit scope flags</label><p>{[['TPIT',detailTask.tpit],['TPIDL',detailTask.tpidl],['TENITALYPS',detailTask.tenItalyPs]].filter(([,value])=>value).map(([label,value])=>`${label}: ${value}`).join(' · ')}</p></>}
        {detailTask.userRole && <><label className="field-label">User role</label><p>{detailTask.userRole}</p></>}
        <label className="field-label">Task status</label><select className="field-control" value={detailTask.status} onChange={e=>updateTask(detailTask.id,{status:e.target.value})}><option>Not started</option><option>In progress</option><option>Blocked</option><option>Complete</option></select>
        <label className="field-label">Owner / team</label><input className="field-control" value={detailTask.owner} onChange={e=>updateTask(detailTask.id,{owner:e.target.value})}/>
        <label className="field-label">Comments / blockers</label><textarea className="field-control textarea" rows="4" placeholder="Add progress notes, blockers or handover comments..." value={detailTask.note||''} onChange={e=>updateTask(detailTask.id,{note:e.target.value})}/>
        {detailTask.prerequisiteId && <><label className="field-label">Prerequisite</label><p>{detailTask.prerequisiteId}{detailTask.prerequisiteDescription ? ` · ${detailTask.prerequisiteDescription}` : ''}</p></>}
        {detailTask.actionType && <><label className="field-label">Action type</label><p>{detailTask.actionType}</p></>}
        {detailTask.processType && <><label className="field-label">Process type</label><p>{detailTask.processType}</p></>}
        {detailTask.navigationPath && <><label className="field-label">Navigation path</label><p>{detailTask.navigationPath}</p></>}
        {detailTask.actionDetails && <><label className="field-label">Action details</label><p>{detailTask.actionDetails}</p></>}
        {detailTask.suspensionStatus && <><label className="field-label">Suspension status</label><p>{detailTask.suspensionStatus}</p></>}
        {(detailTask.expectedStartTime || detailTask.expectedCompletionTime) && <><label className="field-label">Expected run time</label><p>{[detailTask.expectedStartTime,detailTask.expectedCompletionTime].filter(Boolean).join(' – ')}</p></>}
        {detailTask.completionCheck && <><label className="field-label">Completion check</label><p>{detailTask.completionCheck}</p></>}
        {detailTask.expectedOutcome && <><label className="field-label">Expected outcome</label><p>{detailTask.expectedOutcome}</p></>}
        <div className="drawer-note"><ShieldCheck size={16}/><span>Workflow edits are stored separately from the source operational checklist and BU/ledger mapping.</span></div>
      </div>
      <div className="drawer-footer"><button className="btn secondary" onClick={()=>setDetailTask(null)}>Cancel</button><button className="btn primary" onClick={saveTask} disabled={saving}><Check size={16}/>{saving?'Saving…':'Save changes'}</button></div>
    </div></div>}

    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}<button onClick={()=>setToast('')}><X size={15}/></button></div>}
  </div>;
}

function Dashboard(props) {
  const {completion,completedCount,inProgressCount,blockedCount,pendingCount,fullyClosed,unscheduledCount,entityStats,applicable,onGoChecklist,onSelectEntity,onViewEntities,onOpenTask}=props;
  const openTasks=applicable.filter(t=>t.status!=='Complete');
  const attention=applicable.filter(t=>t.status==='Blocked').slice(0,5);
  const schedule=[...new Map(applicable.map(task=>[task.checklistRowId,task])).values()]
    .sort((a,b)=>Number(a.due??Infinity)-Number(b.due??Infinity) || Number(a.checklistNo)-Number(b.checklistNo))
    .slice(0,5);
  return <section className="page-section">
    <div className="welcome-row"><div><div className="eyebrow">GROUP FINANCE / CLOSE MANAGEMENT</div><h1>Operational checklist overview</h1><p>Activity status across <strong>{entityStats.length} mapped business units</strong>.</p></div><div className="welcome-actions"><span className="period-badge"><FileSpreadsheet size={15}/> Oracle data</span><button className="btn primary" onClick={onGoChecklist}><ListChecks size={16}/> Open checklist</button></div></div>
    <div className="callout"><div className="callout-icon"><Sparkles size={19}/></div><div className="callout-copy"><strong>Checklist overview</strong><p>{completion}% of {applicable.length} checklist / business-unit activities are complete across {entityStats.length} mapped business units. <b>{blockedCount} activities</b> are blocked and need review.</p></div><button className="callout-link" onClick={onGoChecklist}>Review tasks <ArrowUpRight size={14}/></button></div>
    <div className="stats-grid">
      <StatCard label="Checklist completion" value={`${completion}%`} sub={`${completedCount} of ${applicable.length} activities complete`} icon={ChartNoAxesCombined} tone="blue"/>
      <StatCard label="Business units fully closed" value={`${fullyClosed} / ${entityStats.length}`} sub="All mapped checklist rows complete" icon={ShieldCheck} tone="green"/>
      <StatCard label="Open activities" value={openTasks.length.toLocaleString()} sub={`${inProgressCount} currently in progress`} icon={Clock3} tone="amber"/>
      <StatCard label="Activities without timing" value={unscheduledCount} sub="WORKDAYS not set in source" icon={AlertTriangle} tone="red"/>
    </div>
    <div className="dashboard-grid">
      <div className="panel entity-overview">
        <div className="panel-heading"><div><h2>Business unit overview</h2><p>Close progress by mapped BU</p></div><button className="text-btn" onClick={onViewEntities}>View all units <ArrowUpRight size={14}/></button></div>
        <div className="entity-table"><div className="entity-table-head"><span>BUSINESS UNIT</span><span>PROGRESS</span><span>STATUS</span></div>
          {entityStats.slice(0,7).map(e=><button className="entity-table-row" key={e.id} onClick={()=>onSelectEntity(e.id)}><div className="entity-cell"><div className="entity-mini-icon"><Building2 size={16}/></div><div><strong>{e.name}</strong><small>{e.legalEntityName}</small></div></div><div className="entity-progress-cell"><div className="entity-progress-text"><strong>{e.pct}%</strong><small>{e.done}/{e.total} tasks</small></div><Progress value={e.pct} color={e.pct===100?'green':'blue'}/></div><div className="entity-status-cell">{e.pct===100?<StatusPill status="Complete"/>:e.blocked>0?<StatusPill status="Blocked"/>:<StatusPill status={e.inProgress>0?'In progress':'Not started'}/>}</div></button>)}
        </div><button className="panel-bottom-link" onClick={onViewEntities}>View all {entityStats.length} business units <ChevronRight size={15}/></button>
      </div>
      <div className="panel attention-panel">
        <div className="panel-heading"><div><h2>Blocked activities</h2><p>Activities currently marked blocked</p></div><span className="attention-count">{blockedCount}</span></div>
        {attention.length===0?<div className="no-attention"><CheckCircle2 size={27}/><strong>No blocked activities</strong><p>There are no blocked activities in the current checklist data.</p></div>:<div className="attention-list">{attention.map(t=><button className="attention-item" key={t.id} onClick={()=>onOpenTask(t)}><span className="attention-alert red"><AlertTriangle size={16}/></span><span className="attention-copy"><strong>{t.title}</strong><small>{t.entity} · {formatWorkdays(t.due)} · {t.owner}</small></span><ChevronRight size={16}/></button>)}</div>}
        <button className="panel-bottom-link" onClick={onGoChecklist}>View all open activities <ChevronRight size={15}/></button>
      </div>
    </div>
    <div className="bottom-grid">
      <div className="panel"><div className="panel-heading"><div><h2>Close progress</h2><p>Overall activity status</p></div><span className="panel-icon"><Activity size={18}/></span></div><div className="big-progress"><div className="big-progress-value">{completion}%</div><div className="big-progress-copy"><strong>Activities completed</strong><span>{completedCount} completed out of {applicable.length} tasks</span></div></div><Progress value={completion} color="green"/><div className="status-metrics"><div><span className="legend-dot green"/><span>Complete</span><strong>{completedCount}</strong></div><div><span className="legend-dot blue"/><span>In progress</span><strong>{inProgressCount}</strong></div><div><span className="legend-dot amber"/><span>Not started</span><strong>{pendingCount}</strong></div><div><span className="legend-dot red"/><span>Blocked</span><strong>{blockedCount}</strong></div></div></div>
      <div className="panel"><div className="panel-heading"><div><h2>Source checklist schedule</h2><p>WORKDAYS and steps from Oracle</p></div><span className="panel-icon"><CalendarDays size={18}/></span></div><div className="milestone-list">{schedule.map((task,index)=><div className="milestone" key={task.checklistRowId}><div className={`milestone-check ${task.status==='Complete'?'done':''}`}>{task.status==='Complete'?<Check size={13}/>:index+1}</div><div className="milestone-copy"><strong>{task.stepId} · {task.title}</strong><small>{task.module} · {task.status}</small></div><span className="milestone-day">{formatWorkdays(task.due)}</span></div>)}</div></div>
    </div>
  </section>;
}
