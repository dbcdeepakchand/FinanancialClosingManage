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
    required: 'BUSINESS_UNIT, STEP_DESCRIPTION',
    columns: [
      'MODULE_NAME', 'BUSINESS_UNIT', 'LEGAL_ENTITY', 'PROCESS_OWNER',
      'STEP_DESCRIPTION', 'STEP_COMMENT', 'ACTION_BY', 'PRE_REQUISITE_DESC',
      'ACTION_TYPE', 'PROCESS_TYPE'
    ]
  },
  mapping: {
    label: 'Upload Business Units',
    fileName: 'business-unit-ledger-template.csv',
    tableName: 'XX_BU_LE_LEDGER_MAPPING',
    required: 'BUSINESS_UNIT_ID, BUSINESS_UNIT_NAME, LEGAL_ENTITY_ID, LEGAL_ENTITY_NAME, LEDGER_ID, LEDGER_NAME',
    columns: [
      'BUSINESS_UNIT_ID', 'BUSINESS_UNIT_NAME', 'LEGAL_ENTITY_ID', 'LEGAL_ENTITY_NAME',
      'LEDGER_ID', 'LEDGER_NAME', 'CURRENCY_CODE', 'CUTOFF_DATE', 'DUE_DAYS'
    ]
  }
};

const navItems = [
  { id:'dashboard', label:'Dashboard', icon:LayoutDashboard },
  { id:'checklist', label:'Close checklist', icon:ListChecks },
  { id:'entities', label:'Business units', icon:Building2 },
  { id:'calendar', label:'Checklist sequence', icon:CalendarDays },
  { id:'reports', label:'Reports & analytics', icon:ChartNoAxesCombined }
];

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
      throw new Error('Application API is unavailable or returned an HTML page instead of JSON. Start the API server and retry.');
    }

    try {
      result = JSON.parse(trimmed);
    } catch (error) {
      const fallback = contentType.includes('application/json') ? 'The Application response was not valid JSON.' : 'The Application API returned an unexpected response.';
      throw new Error(fallback);
    }
  }

  if (!response.ok) {
    const message = result?.error ||
      (response.status >= 500 && !rawText
        ? 'The API server did not respond. In development, start it with `npm run api` in a separate terminal and configure Applicationsettings in `.env`.'
        : `Request failed (${response.status})`);
    throw new Error(message);
  }

  return result;
}

function StatusPill({status}) {
  const cls = status === 'Complete' ? 'complete' : status === 'In progress' ? 'progress' : status === 'Blocked' ? 'blocked' : 'pending';
  return <span className={`status-pill ${cls}`}><span className="status-dot"/>{status}</span>;
}

function compareChecklistTasks(a, b) {
  return Number(a.checklistRowId) - Number(b.checklistRowId) ||
    a.entity.localeCompare(b.entity);
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
  const [loading,setLoading] = useState(true);
  const [apiError,setApiError] = useState('');
  const [reloadCount,setReloadCount] = useState(0);
  const [saving,setSaving] = useState(false);
  const [page,setPage] = useState('dashboard');
  const [selectedLegalEntity,setSelectedLegalEntity] = useState('ALL');
  const [selectedEntity,setSelectedEntity] = useState('ALL');
  const [search,setSearch] = useState('');
  const [statusFilter,setStatusFilter] = useState('All statuses');
  const [moduleFilter,setModuleFilter] = useState('All modules');
  const [toast,setToast] = useState('');
  const [mobileNav,setMobileNav] = useState(false);
  const [sidebarCollapsed,setSidebarCollapsed] = useState(false);
  const [detailTask,setDetailTask] = useState(null);
  const [dataSource,setDataSource] = useState('checklist');
  const [uploadRows,setUploadRows] = useState([]);
  const [uploadFileName,setUploadFileName] = useState('');
  const [uploadError,setUploadError] = useState('');
  const [uploading,setUploading] = useState(false);
  const [businessUnits,setBusinessUnits] = useState([]);
  const [businessUnitsLoading,setBusinessUnitsLoading] = useState(true);
  const [businessUnitLoadError,setBusinessUnitLoadError] = useState('');
  const [selectedBusinessUnitId,setSelectedBusinessUnitId] = useState(null);
  const [businessUnitEditor,setBusinessUnitEditor] = useState(null);
  const [businessUnitForm,setBusinessUnitForm] = useState({
    BUSINESS_UNIT_ID: '', BUSINESS_UNIT_NAME: '', LEGAL_ENTITY_ID: '', LEGAL_ENTITY_NAME: '',
    LEDGER_ID: '', LEDGER_NAME: '', CURRENCY_CODE: '', CUTOFF_DATE: '', DUE_DAYS: ''
  });
  const [businessUnitSaving,setBusinessUnitSaving] = useState(false);
  const [businessUnitError,setBusinessUnitError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadTasks = async () => {
      setLoading(true);
      setApiError('');
      try {
        const data = await apiRequest('/tasks');
        if (!Array.isArray(data.tasks) || !Array.isArray(data.entities)) {
          throw new Error('Application returned an unexpected checklist or business-unit response.');
        }
        if (!cancelled) {
          setTasks(data.tasks);
        }
      } catch (error) {
        if (!cancelled) setApiError(`Could not load tasks from Application: ${error.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadTasks();
    return () => { cancelled = true; };
  }, [reloadCount]);

  useEffect(() => { if(toast) { const timer=setTimeout(()=>setToast(''),3200); return ()=>clearTimeout(timer); } },[toast]);

  useEffect(() => {
    let cancelled = false;
    const loadBusinessUnits = async () => {
      setBusinessUnitsLoading(true);
      setBusinessUnitLoadError('');
      try {
        const data = await apiRequest('/business-units');
        if (!Array.isArray(data.businessUnits)) {
          throw new Error('Application returned an unexpected Business Unit mapping response.');
        }
        if (!cancelled) setBusinessUnits(data.businessUnits);
      } catch (error) {
        if (!cancelled) {
          setBusinessUnits([]);
          const message = error.message.includes('API route not found.')
            ? 'The API server is running an older version. Restart it with `npm run api` from the repository root, then retry.'
            : `Could not load Business Unit mappings from Application: ${error.message}`;
          setBusinessUnitLoadError(message);
        }
      } finally {
        if (!cancelled) setBusinessUnitsLoading(false);
      }
    };
    loadBusinessUnits();
    return () => { cancelled = true; };
  }, [reloadCount]);

  const applicable = selectedLegalEntity === 'ALL'
    ? tasks
    : tasks.filter(task => task.legalEntityName === selectedLegalEntity);
  const legalEntityNames = [...new Set([
    ...tasks.map(task => task.legalEntityName),
    ...businessUnits.map(record => record.LEGAL_ENTITY_NAME)
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const legalEntityOptions = legalEntityNames.map(name => ({
    name,
    businessUnitCount: new Set([
      ...tasks.filter(task => task.legalEntityName === name).map(task => task.entity),
      ...businessUnits.filter(record => record.LEGAL_ENTITY_NAME === name)
        .map(record => record.BUSINESS_UNIT_NAME || record.BUSINESS_UNIT_ID)
    ]).size
  }));
  const businessUnitOptions = [...new Map(applicable.map(task => [
    task.businessUnitId,
    { id: task.businessUnitId, name: task.entity }
  ])).values()];
  const visibleTasks = useMemo(() => applicable.filter(t =>
    (selectedEntity === 'ALL' || t.businessUnitId === selectedEntity) &&
    (statusFilter === 'All statuses' || t.status === statusFilter) &&
    (moduleFilter === 'All modules' || t.module === moduleFilter) &&
    [t.title,t.module,t.owner,t.entity,t.legalEntityName]
      .filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase())
  ).sort(compareChecklistTasks),[applicable,selectedEntity,statusFilter,moduleFilter,search]);

  const completedCount = applicable.filter(t=>t.status==='Complete').length;
  const inProgressCount = applicable.filter(t=>t.status==='In progress').length;
  const blockedCount = applicable.filter(t=>t.status==='Blocked').length;
  const pendingCount = applicable.filter(t=>t.status==='Not started').length;
  const completion = applicable.length ? Math.round(completedCount/applicable.length*100) : 0;
  const scopedBusinessUnits = businessUnits.filter(record =>
    selectedLegalEntity === 'ALL' || record.LEGAL_ENTITY_NAME === selectedLegalEntity
  );
  const mappingBusinessUnits = scopedBusinessUnits.map((record, index) => ({
    id: record.MAPPING_ID ? `mapping:${record.MAPPING_ID}` : `mapping:${record.BUSINESS_UNIT_ID}:${record.LEGAL_ENTITY_ID}:${record.LEDGER_ID}:${index}`,
    name: record.BUSINESS_UNIT_NAME || record.BUSINESS_UNIT_ID || 'Unassigned',
    mappingRecord: record
  }));
  const businessUnitCards = mappingBusinessUnits.map(e=>{
    const list = applicable.filter(t =>
      t.businessUnitId === e.mappingRecord.BUSINESS_UNIT_NAME ||
      t.entity === e.mappingRecord.BUSINESS_UNIT_NAME
    );
    const done = list.filter(t=>t.status==='Complete').length;
    const inProgress = list.filter(t=>t.status==='In progress').length;
    const blocked = list.filter(t=>t.status==='Blocked').length;
    return { ...e, total: list.length, done, inProgress, blocked, pending: list.length-done-inProgress-blocked, pct: list.length ? Math.round(done/list.length*100) : 0 };
  });
  const dashboardUnits = [
    ...scopedBusinessUnits.map(record => ({
      id: record.BUSINESS_UNIT_NAME || record.BUSINESS_UNIT_ID || 'Unassigned',
      name: record.BUSINESS_UNIT_NAME || record.BUSINESS_UNIT_ID || 'Unassigned',
      legalEntityName: record.LEGAL_ENTITY_NAME
    })),
    ...applicable.map(task => ({
      id: task.businessUnitId,
      name: task.entity,
      legalEntityName: task.legalEntityName
    }))
  ];
  const entityStats = [...new Map(dashboardUnits.map(unit => [unit.id, unit])).values()].map(e=>{
    const list = applicable.filter(t=>t.businessUnitId===e.id || t.entity===e.name);
    const done = list.filter(t=>t.status==='Complete').length;
    const inProgress = list.filter(t=>t.status==='In progress').length;
    const blocked = list.filter(t=>t.status==='Blocked').length;
    return { ...e, total: list.length, done, inProgress, blocked, pending: list.length-done-inProgress-blocked, pct: list.length ? Math.round(done/list.length*100) : 0 };
  });
  const fullyClosed = entityStats.filter(e=>e.total>0 && e.done===e.total).length;
  const modules = [...new Set(applicable.map(t=>t.module))].sort();
  const checklistRows = [...new Map(applicable.map(task=>[task.checklistRowId,task])).values()]
    .sort(compareChecklistTasks);

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
      setToast('Task changes saved to Application.');
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
      setToast(`${result.inserted} rows inserted into Application.`);
      setReloadCount(count => count + 1);
    } catch (error) {
      setUploadError(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const openBusinessUnitEditor = (record = null) => {
    const selectedRecord = record || {
      BUSINESS_UNIT_ID: '',
      BUSINESS_UNIT_NAME: '',
      LEGAL_ENTITY_ID: '',
      LEGAL_ENTITY_NAME: '',
      LEDGER_ID: '',
      LEDGER_NAME: '',
      CURRENCY_CODE: '',
      CUTOFF_DATE: '',
      DUE_DAYS: ''
    };
    setBusinessUnitForm(selectedRecord);
    setBusinessUnitError('');
    setBusinessUnitEditor(true);
  };

  const updateBusinessUnitField = (field, value) => {
    setBusinessUnitForm(current => ({ ...current, [field]: value }));
  };

  const saveBusinessUnitRecord = async () => {
    setBusinessUnitSaving(true);
    setBusinessUnitError('');
    try {
      const payload = {
        record: {
          ...businessUnitForm,
          BUSINESS_UNIT_ID: String(businessUnitForm.BUSINESS_UNIT_ID ?? '').trim(),
          BUSINESS_UNIT_NAME: String(businessUnitForm.BUSINESS_UNIT_NAME ?? '').trim(),
          LEGAL_ENTITY_ID: String(businessUnitForm.LEGAL_ENTITY_ID ?? '').trim(),
          LEGAL_ENTITY_NAME: String(businessUnitForm.LEGAL_ENTITY_NAME ?? '').trim(),
          LEDGER_ID: String(businessUnitForm.LEDGER_ID ?? '').trim(),
          LEDGER_NAME: String(businessUnitForm.LEDGER_NAME ?? '').trim(),
          CURRENCY_CODE: String(businessUnitForm.CURRENCY_CODE ?? '').trim(),
          CUTOFF_DATE: String(businessUnitForm.CUTOFF_DATE ?? '').trim(),
          DUE_DAYS: String(businessUnitForm.DUE_DAYS ?? '').trim()
        }
      };

      if (!payload.record.BUSINESS_UNIT_ID || !payload.record.BUSINESS_UNIT_NAME || !payload.record.LEGAL_ENTITY_ID || !payload.record.LEGAL_ENTITY_NAME || !payload.record.LEDGER_ID || !payload.record.LEDGER_NAME) {
        throw new Error('Business unit, legal entity and ledger details are required.');
      }

      await apiRequest('/business-units', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setBusinessUnitEditor(null);
      setToast('Business unit record saved to XX_BU_LE_LEDGER_MAPPING.');
      setReloadCount(count => count + 1);
    } catch (error) {
      setBusinessUnitError(error.message);
    } finally {
      setBusinessUnitSaving(false);
    }
  };

  const exportCsv = () => {
    const rows = [['CHECKLIST_ROW_ID','MODULE_NAME','BUSINESS_UNIT','LEGAL_ENTITY','PROCESS_OWNER','STEP_DESCRIPTION','STEP_COMMENT','ACTION_BY','PRE_REQUISITE_DESC','ACTION_TYPE','PROCESS_TYPE','STATUS','ASSIGNED_USER','WORKFLOW_COMMENT']];
    visibleTasks.forEach(t=>{
      rows.push([t.checklistRowId,t.moduleName,t.entity,t.legalEntityName,t.processOwner,t.title,t.stepComment,t.actionBy,t.prerequisiteDescription,t.actionType,t.processType,t.status,t.owner,t.note||'']);
    });
    const csv = rows.map(row=>row.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='operational-checklist.csv'; a.click(); URL.revokeObjectURL(url);
    setToast('Checklist exported to CSV');
  };

  const pageTitle = page === 'dataSource' ? 'Data source' : navItems.find(n=>n.id===page)?.label || 'Dashboard';

  return <div className={`app-shell ${sidebarCollapsed?'sidebar-collapsed':''}`}>
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
    </aside>

    {mobileNav && <div className="mobile-backdrop" onClick={()=>setMobileNav(false)}/>}
    <main className="main-area">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-btn mobile-menu" aria-label="Toggle navigation" aria-expanded={window.matchMedia('(max-width: 720px)').matches ? mobileNav : !sidebarCollapsed} onClick={()=>{if(window.matchMedia('(max-width: 720px)').matches){setMobileNav(open=>!open);}else{setSidebarCollapsed(collapsed=>!collapsed);}}}><Menu size={20}/></button><span className="breadcrumb">Finance Operations</span><ChevronRight size={14}/><strong>{pageTitle}</strong></div>
        {selectedLegalEntity !== 'ALL' && <div className="selected-entity-context"><span>LEGAL ENTITY</span><strong>{selectedLegalEntity}</strong></div>}
      </header>

      {apiError && <div className="api-error" role="alert"><span>{apiError}</span><button className="btn secondary compact" onClick={()=>setReloadCount(count=>count+1)} disabled={loading}>Retry</button></div>}
      {loading && <div className="api-loading" role="status">Connecting to Application and loading close tasks…</div>}
      <div className={`page-content ${page==='entities' ? 'business-units-content' : ''}`}>
        {page==='dashboard' && <Dashboard
          completion={completion} completedCount={completedCount}
          inProgressCount={inProgressCount} blockedCount={blockedCount} pendingCount={pendingCount}
          fullyClosed={fullyClosed} moduleCount={modules.length} entityStats={entityStats}
            legalEntityOptions={legalEntityOptions} selectedLegalEntity={selectedLegalEntity}
            onSelectLegalEntity={name=>{setSelectedLegalEntity(name);setSelectedEntity('ALL');}}
            applicable={applicable} onGoChecklist={()=>setPage('checklist')} onSelectEntity={id=>{setSelectedEntity(id);setPage('checklist');}}
          onViewEntities={()=>setPage('entities')} onOpenTask={t=>setDetailTask(t)}
        />}

        {page==='checklist' && <section className="page-section">
          <div className="page-heading"><div><div className="eyebrow">CLOSE EXECUTION</div><h1>Operational checklist</h1><p>Checklist activities are assigned directly to the business unit and legal entity in each source row.</p></div><button className="btn secondary" onClick={exportCsv}><Download size={16}/> Export</button></div>
          <div className="inline-summary"><div><span className="summary-dot green"/><strong>{completedCount}</strong><span>Complete</span></div><div><span className="summary-dot blue"/><strong>{inProgressCount}</strong><span>In progress</span></div><div><span className="summary-dot amber"/><strong>{pendingCount}</strong><span>Not started</span></div><div><span className="summary-dot red"/><strong>{blockedCount}</strong><span>Blocked</span></div></div>
          <div className="table-card">
            <div className="table-toolbar"><div className="search-box"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search activities, owners, units..."/></div><div className="toolbar-filters"><select value={selectedEntity} onChange={e=>setSelectedEntity(e.target.value)}><option value="ALL">All business units</option>{businessUnitOptions.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option>All statuses</option><option>Not started</option><option>In progress</option><option>Blocked</option><option>Complete</option></select><select value={moduleFilter} onChange={e=>setModuleFilter(e.target.value)}><option>All modules</option>{modules.map(m=><option key={m}>{m}</option>)}</select></div></div>
            <div className="table-scroll"><table><thead><tr><th>Activity</th><th>Business unit / legal entity</th><th>Process owner</th><th>Action / process type</th><th>Status</th><th></th></tr></thead><tbody>
              {visibleTasks.map(t=><tr key={t.id} onClick={()=>setDetailTask(t)} className="clickable-row"><td><div className="task-name">{t.status==='Complete'?<CheckCircle2 size={16} className="task-check done"/>:<Circle size={16} className="task-check"/>}<div><strong>{t.title}</strong><small>{t.module}</small></div></div></td><td><span className="entity-code">{t.entity}</span><span className="entity-short">{t.legalEntityName}</span></td><td><span className="owner-name"><span className="mini-avatar">{t.owner.split(' ').map(s=>s[0]).join('').slice(0,2)}</span>{t.owner}</span></td><td>{t.actionType || t.processType || '—'}</td><td><StatusPill status={t.status}/></td><td><button className="row-more" onClick={e=>{e.stopPropagation();setDetailTask(t)}}><ChevronRight size={17}/></button></td></tr>)}
              {visibleTasks.length===0&&<tr><td colSpan="6" className="empty-state">No tasks match your filters.</td></tr>}
            </tbody></table></div>
            <div className="table-footer"><span>Showing <strong>{visibleTasks.length}</strong> of {applicable.length} checklist rows</span><span>Source checklist rows: <strong>{new Set(applicable.map(t=>t.checklistRowId)).size}</strong></span></div>
          </div>
        </section>}

        {page==='entities' && <section className="page-section">
          <div className="page-heading"><div><div className="eyebrow">BUSINESS UNIT OVERSIGHT</div><h1>Business units</h1><p>{businessUnitsLoading ? 'Loading mapping records…' : `${businessUnits.length} mapping records from XX_BU_LE_LEDGER_MAPPING.`}</p></div><div className="entity-page-actions"><button className="btn secondary add-bu-button" onClick={()=>openBusinessUnitEditor()}><CheckCircle2 size={16}/> Add business unit</button>{selectedBusinessUnitId && <button className="btn secondary" onClick={() => {
            const selected = businessUnitCards.find(e => e.id === selectedBusinessUnitId);
            openBusinessUnitEditor(selected?.mappingRecord || {
              BUSINESS_UNIT_ID: String(selected?.sourceId || ''),
              BUSINESS_UNIT_NAME: selected?.name || '',
              LEGAL_ENTITY_ID: '',
              LEGAL_ENTITY_NAME: '',
              LEDGER_ID: '',
              LEDGER_NAME: '',
              CURRENCY_CODE: '',
              CUTOFF_DATE: '',
              DUE_DAYS: ''
            });
          }}><CheckCircle2 size={16}/> Update mapping</button>}<button className="btn secondary" onClick={exportCsv}><Download size={16}/> Export overview</button></div></div>
          {businessUnitLoadError && <div className="form-error business-unit-load-error" role="alert"><span>{businessUnitLoadError}</span><button className="btn secondary compact" onClick={()=>setReloadCount(count=>count+1)} disabled={businessUnitsLoading}>Retry</button></div>}
          {businessUnitsLoading && <div className="api-loading" role="status">Loading Business Units from XX_BU_LE_LEDGER_MAPPING…</div>}
          {!businessUnitsLoading && !businessUnitLoadError && businessUnitCards.length === 0 && <div className="empty-state">No Business Unit mapping records were found in XX_BU_LE_LEDGER_MAPPING.</div>}
          {!businessUnitsLoading && !businessUnitLoadError && <div className="entity-grid">{businessUnitCards.map(e=>{
            const isSelected = selectedBusinessUnitId === e.id;
            return <div key={e.id} className="entity-card-wrap">
              <button className={`entity-card ${isSelected ? 'selected' : ''}`} aria-pressed={isSelected} onClick={()=>setSelectedBusinessUnitId(isSelected ? null : e.id)}>
                <span className={`entity-selection-radio ${isSelected ? 'selected' : ''}`} aria-hidden="true"/>
                <div className="entity-card-top"><div className="entity-symbol"><Building2 size={19}/></div><ChevronRight size={16}/></div>
                <h3>{e.name}</h3>
                <div className="entity-progress-label"><span>Close completion</span><strong>{e.pct}%</strong></div><Progress value={e.pct} color={e.pct===100?'green':'blue'}/><div className="entity-card-bottom"><span><CheckCircle2 size={14}/>{e.done} complete</span><span><Clock3 size={14}/>{e.pending+e.inProgress+e.blocked} open</span></div>
              </button>
            </div>;
          })}</div>}
        </section>}

        {page==='calendar' && <section className="page-section">
          <div className="page-heading"><div><div className="eyebrow">SOURCE CHECKLIST</div><h1>Checklist sequence</h1><p>Operational steps grouped by module, business unit and legal entity.</p></div><button className="btn secondary" onClick={exportCsv}><Download size={16}/> Export checklist</button></div>
          <div className="calendar-banner"><div className="calendar-banner-icon"><CalendarRange size={23}/></div><div><strong>{checklistRows.length} operational checklist steps</strong><p>Checklist activities are grouped by module and business unit.</p></div></div>
          <div className="timeline">{checklistRows.map((task,index)=><div className="timeline-item" key={task.checklistRowId}>
            <div className={`timeline-marker ${index===0?'current':''}`}>{index+1}</div>
            <div className="timeline-content"><div className="timeline-top"><span className="timeline-day">{task.entity}</span><span className="module-chip">{task.module}</span></div>
              <h3>{task.title}</h3><p>{task.actionType || task.processType || task.note || 'No additional details in the source checklist.'}</p>
            </div>
          </div>)}</div>
        </section>}

        {page==='reports' && <section className="page-section">
          <div className="page-heading"><div><div className="eyebrow">PERFORMANCE & INSIGHTS</div><h1>Reports & analytics</h1><p>Review progress, workload and close execution risks.</p></div><button className="btn primary" onClick={exportCsv}><Download size={16}/> Export report</button></div>
          <div className="stats-grid"><StatCard label="Overall completion" value={`${completion}%`} sub={`${completedCount} of ${applicable.length} activities`} icon={ChartNoAxesCombined} tone="blue"/><StatCard label="Business units fully closed" value={`${fullyClosed} / ${entityStats.length}`} sub="All source business-unit/legal-entity rows complete" icon={ShieldCheck} tone="green"/><StatCard label="Checklist modules" value={modules.length} sub="Distinct modules in the source rows" icon={CalendarRange} tone="amber"/><StatCard label="Blocked tasks" value={blockedCount} sub="Requires intervention" icon={CircleAlert} tone="red"/></div>
          <div className="reports-grid"><div className="panel"><div className="panel-heading"><div><h2>Business unit completion</h2><p>Completion rate by source business unit</p></div><span className="panel-icon"><ChartNoAxesCombined size={18}/></span></div><div className="bar-chart">{entityStats.map(e=><div className="bar-row" key={e.id}><span title={e.name}>{e.name}</span><div className="bar-bg"><div className="bar-fill" style={{width:`${e.pct}%`}}/></div><strong>{e.pct}%</strong></div>)}</div></div>
          <div className="panel"><div className="panel-heading"><div><h2>Task status mix</h2><p>Current operational checklist instances</p></div><span className="panel-icon"><Activity size={18}/></span></div><div className="status-breakdown"><div className="donut-wrap"><div className="donut" style={{background:`conic-gradient(#1b9875 0 ${completedCount/Math.max(applicable.length,1)*100}%, #4b88d2 ${completedCount/Math.max(applicable.length,1)*100}% ${(completedCount+inProgressCount)/Math.max(applicable.length,1)*100}%, #d99a2b ${(completedCount+inProgressCount)/Math.max(applicable.length,1)*100}% ${(completedCount+inProgressCount+pendingCount)/Math.max(applicable.length,1)*100}%, #d75d5d ${(completedCount+inProgressCount+pendingCount)/Math.max(applicable.length,1)*100}% 100%)`}}><div className="donut-hole"><strong>{completion}%</strong><span>Complete</span></div></div></div><div className="legend">{[['Complete',completedCount,'green'],['In progress',inProgressCount,'blue'],['Not started',pendingCount,'amber'],['Blocked',blockedCount,'red']].map(([label,count,color])=><div className="legend-item" key={label}><span className={`legend-dot ${color}`}/><span>{label}</span><strong>{count}</strong></div>)}</div></div></div></div>
          <div className="panel attention-panel"><div className="panel-heading"><div><h2>Blocked activities</h2><p>Activities currently marked blocked</p></div><button className="text-btn" onClick={()=>setPage('checklist')}>View checklist <ArrowUpRight size={14}/></button></div><div className="attention-list">{applicable.filter(t=>t.status==='Blocked').slice(0,7).map(t=><button key={t.id} className="attention-item" onClick={()=>setDetailTask(t)}><span className="attention-alert red"><AlertTriangle size={16}/></span><span className="attention-copy"><strong>{t.title}</strong><small>{t.entity} · {t.owner}</small></span><StatusPill status={t.status}/><ChevronRight size={16}/></button>)}</div></div>
        </section>}

        {page==='dataSource' && <section className="page-section">
          <div className="page-heading"><div><h1>{uploadTemplates[dataSource].label}</h1></div><button className="btn secondary" onClick={downloadUploadTemplate}><Download size={16}/> Download template</button></div>
          <div className="upload-card">
            <div className="upload-card-icon"><FileSpreadsheet size={21}/></div>
            <div className="upload-card-copy"><h2>{uploadTemplates[dataSource].label}</h2></div>
            <div className="upload-controls">
              <label className="btn secondary upload-file-label"><Upload size={16}/> Choose CSV<input type="file" accept=".csv,text/csv" onChange={selectUploadFile}/></label>
              <button className="btn primary" onClick={submitUpload} disabled={!uploadRows.length||uploading}><Upload size={16}/>{uploading?'Uploading…':`Insert ${uploadRows.length||''} rows`}</button>
            </div>
            <p className="upload-guidance">CSV only · Up to 5,000 rows and 5 MB per upload. </p>
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
        <label className="field-label">Business unit</label><p>{detailTask.entity}</p>
        {detailTask.legalEntityName && <><label className="field-label">Legal entity</label><p>{detailTask.legalEntityName}</p></>}
        {detailTask.processOwner && <><label className="field-label">Source process owner</label><p>{detailTask.processOwner}</p></>}
        {detailTask.actionBy && <><label className="field-label">Action by</label><p>{detailTask.actionBy}</p></>}
        <label className="field-label">Task status</label><select className="field-control" value={detailTask.status} onChange={e=>updateTask(detailTask.id,{status:e.target.value})}><option>Not started</option><option>In progress</option><option>Blocked</option><option>Complete</option></select>
        <label className="field-label">Owner / team</label><input className="field-control" value={detailTask.owner} onChange={e=>updateTask(detailTask.id,{owner:e.target.value})}/>
        <label className="field-label">Comments / blockers</label><textarea className="field-control textarea" rows="4" placeholder="Add progress notes, blockers or handover comments..." value={detailTask.note||''} onChange={e=>updateTask(detailTask.id,{note:e.target.value})}/>
        {detailTask.prerequisiteDescription && <><label className="field-label">Prerequisite description</label><p>{detailTask.prerequisiteDescription}</p></>}
        {detailTask.actionType && <><label className="field-label">Action type</label><p>{detailTask.actionType}</p></>}
        {detailTask.processType && <><label className="field-label">Process type</label><p>{detailTask.processType}</p></>}
        <div className="drawer-note"><ShieldCheck size={16}/><span>Workflow status, owner and comments are stored separately from the source checklist.</span></div>
      </div>
      <div className="drawer-footer"><button className="btn secondary" onClick={()=>setDetailTask(null)}>Cancel</button><button className="btn primary" onClick={saveTask} disabled={saving}><Check size={16}/>{saving?'Saving…':'Save changes'}</button></div>
    </div></div>}

    {businessUnitEditor !== null && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setBusinessUnitEditor(null)}}><div className="detail-drawer business-unit-drawer">
      <div className="drawer-head"><div><div className="eyebrow">BUSINESS UNIT RECORD</div><h2>{businessUnitForm.BUSINESS_UNIT_NAME ? 'Update mapping' : 'Add business unit'}</h2></div><button className="icon-btn" onClick={()=>setBusinessUnitEditor(null)}><X size={19}/></button></div>
      <div className="drawer-body business-unit-form-body">
        {businessUnitError && <p className="form-error" role="alert">{businessUnitError}</p>}
        <div className="field-grid">
          <div><label className="field-label">Business unit ID</label><input className="field-control" value={businessUnitForm.BUSINESS_UNIT_ID} onChange={e=>updateBusinessUnitField('BUSINESS_UNIT_ID', e.target.value)}/></div>
          <div><label className="field-label">Business unit name</label><input className="field-control" value={businessUnitForm.BUSINESS_UNIT_NAME} onChange={e=>updateBusinessUnitField('BUSINESS_UNIT_NAME', e.target.value)}/></div>
          <div><label className="field-label">Legal entity ID</label><input className="field-control" value={businessUnitForm.LEGAL_ENTITY_ID} onChange={e=>updateBusinessUnitField('LEGAL_ENTITY_ID', e.target.value)}/></div>
          <div><label className="field-label">Legal entity name</label><input className="field-control" value={businessUnitForm.LEGAL_ENTITY_NAME} onChange={e=>updateBusinessUnitField('LEGAL_ENTITY_NAME', e.target.value)}/></div>
          <div><label className="field-label">Ledger ID</label><input className="field-control" value={businessUnitForm.LEDGER_ID} onChange={e=>updateBusinessUnitField('LEDGER_ID', e.target.value)}/></div>
          <div><label className="field-label">Ledger name</label><input className="field-control" value={businessUnitForm.LEDGER_NAME} onChange={e=>updateBusinessUnitField('LEDGER_NAME', e.target.value)}/></div>
          <div><label className="field-label">Currency code</label><input className="field-control" value={businessUnitForm.CURRENCY_CODE} onChange={e=>updateBusinessUnitField('CURRENCY_CODE', e.target.value)}/></div>
          <div><label className="field-label">Cutoff date</label><input className="field-control" type="date" value={businessUnitForm.CUTOFF_DATE} onChange={e=>updateBusinessUnitField('CUTOFF_DATE', e.target.value)}/></div>
          <div><label className="field-label">Due days</label><input className="field-control" type="number" value={businessUnitForm.DUE_DAYS} onChange={e=>updateBusinessUnitField('DUE_DAYS', e.target.value)}/></div>
        </div>
      </div>
      <div className="drawer-footer"><button className="btn secondary" onClick={()=>setBusinessUnitEditor(null)}>Cancel</button><button className="btn primary" onClick={saveBusinessUnitRecord} disabled={businessUnitSaving}><Check size={16}/>{businessUnitSaving?'Saving…':'Save mapping'}</button></div>
    </div></div>}

    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}<button onClick={()=>setToast('')}><X size={15}/></button></div>}
  </div>;
}

function Dashboard(props) {
  const {completion,completedCount,inProgressCount,blockedCount,pendingCount,fullyClosed,moduleCount,entityStats,applicable,legalEntityOptions,selectedLegalEntity,onSelectLegalEntity,onGoChecklist,onSelectEntity,onViewEntities,onOpenTask}=props;
  const openTasks=applicable.filter(t=>t.status!=='Complete');
  const attention=applicable.filter(t=>t.status==='Blocked').slice(0,5);
  const schedule=[...new Map(applicable.map(task=>[task.checklistRowId,task])).values()]
    .sort(compareChecklistTasks)
    .slice(0,5);
  return <section className="page-section">
    <div className="welcome-row"><div><div className="eyebrow">GROUP FINANCE / CLOSE MANAGEMENT</div><h1>Operational checklist overview</h1>{selectedLegalEntity !== 'ALL' && <p>Activity status across {selectedLegalEntity}.</p>}</div><div className="welcome-actions"><label className="legal-entity-lov"><select aria-label="Legal entity / business unit" value={selectedLegalEntity} onChange={event=>onSelectLegalEntity(event.target.value)}><option value="ALL">All legal entities / business units</option>{legalEntityOptions.map(entity=><option key={entity.name} value={entity.name}>{entity.name} ({entity.businessUnitCount} business units)</option>)}</select></label><button className="btn primary" onClick={onGoChecklist}><ListChecks size={16}/> Open checklist</button></div></div>
    <div className="callout"><div className="callout-icon"><Sparkles size={19}/></div><div className="callout-copy"><strong>Checklist overview</strong>{selectedLegalEntity !== 'ALL' && <p>{completion}% of {applicable.length} checklist activities are complete for <b>{selectedLegalEntity}</b>. <b>{blockedCount} activities</b> are blocked and need review.</p>}</div><button className="callout-link" onClick={onGoChecklist}>Review tasks <ArrowUpRight size={14}/></button></div>
    <div className="stats-grid dashboard-stats-grid">
      <StatCard label="Checklist completion" value={`${completion}%`} sub={`${completedCount} of ${applicable.length} activities complete`} icon={ChartNoAxesCombined} tone="blue"/>
      <StatCard label="Business units fully closed" value={`${fullyClosed} / ${entityStats.length}`} sub="All source checklist rows complete" icon={ShieldCheck} tone="green"/>
      <StatCard label="Open activities" value={openTasks.length.toLocaleString()} sub={`${inProgressCount} currently in progress`} icon={Clock3} tone="amber"/>
      <StatCard label="Checklist modules" value={moduleCount} sub="Distinct modules in the source rows" icon={AlertTriangle} tone="red"/>
    </div>
    <div className="dashboard-grid">
      <div className="panel entity-overview">
        <div className="panel-heading"><div><h2>Business unit overview</h2><p>Close progress by source BU / legal entity</p></div><button className="text-btn" onClick={onViewEntities}>View all units <ArrowUpRight size={14}/></button></div>
        <div className="entity-table"><div className="entity-table-head"><span>BUSINESS UNIT</span><span>PROGRESS</span><span>STATUS</span></div>
          {entityStats.slice(0,7).map(e=><button className="entity-table-row" key={e.id} onClick={()=>onSelectEntity(e.id)}><div className="entity-cell"><div className="entity-mini-icon"><Building2 size={16}/></div><div><strong>{e.name}</strong><small>{e.legalEntityName || 'Business unit'}</small></div></div><div className="entity-progress-cell"><div className="entity-progress-text"><strong>{e.pct}%</strong><small>{e.done}/{e.total} tasks</small></div><Progress value={e.pct} color={e.pct===100?'green':'blue'}/></div><div className="entity-status-cell">{e.pct===100?<StatusPill status="Complete"/>:e.blocked>0?<StatusPill status="Blocked"/>:<StatusPill status={e.inProgress>0?'In progress':'Not started'}/>}</div></button>)}
        </div><button className="panel-bottom-link" onClick={onViewEntities}>View all {entityStats.length} business units <ChevronRight size={15}/></button>
      </div>
      <div className="panel attention-panel">
        <div className="panel-heading"><div><h2>Blocked activities</h2><p>Activities currently marked blocked</p></div><span className="attention-count">{blockedCount}</span></div>
        {attention.length===0?<div className="no-attention"><CheckCircle2 size={27}/><strong>No blocked activities</strong><p>There are no blocked activities in the current checklist data.</p></div>:<div className="attention-list">{attention.map(t=><button className="attention-item" key={t.id} onClick={()=>onOpenTask(t)}><span className="attention-alert red"><AlertTriangle size={16}/></span><span className="attention-copy"><strong>{t.title}</strong><small>{t.entity} · {t.owner}</small></span><ChevronRight size={16}/></button>)}</div>}
        <button className="panel-bottom-link" onClick={onGoChecklist}>View all open activities <ChevronRight size={15}/></button>
      </div>
    </div>
    <div className="bottom-grid">
      <div className="panel"><div className="panel-heading"><div><h2>Close progress</h2><p>Overall activity status</p></div><span className="panel-icon"><Activity size={18}/></span></div><div className="big-progress"><div className="big-progress-value">{completion}%</div><div className="big-progress-copy"><strong>Activities completed</strong><span>{completedCount} completed out of {applicable.length} tasks</span></div></div><Progress value={completion} color="green"/><div className="status-metrics"><div><span className="legend-dot green"/><span>Complete</span><strong>{completedCount}</strong></div><div><span className="legend-dot blue"/><span>In progress</span><strong>{inProgressCount}</strong></div><div><span className="legend-dot amber"/><span>Not started</span><strong>{pendingCount}</strong></div><div><span className="legend-dot red"/><span>Blocked</span><strong>{blockedCount}</strong></div></div></div>
      <div className="panel"><div className="panel-heading"><div><h2>Source checklist</h2><p>Activities recorded in Application</p></div><span className="panel-icon"><CalendarDays size={18}/></span></div><div className="milestone-list">{schedule.map((task,index)=><div className="milestone" key={task.checklistRowId}><div className={`milestone-check ${task.status==='Complete'?'done':''}`}>{task.status==='Complete'?<Check size={13}/>:index+1}</div><div className="milestone-copy"><strong>{task.title}</strong><small>{task.module} · {task.status}</small></div><span className="milestone-day">{task.entity}</span></div>)}</div></div>
    </div>
  </section>;
}
