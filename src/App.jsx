import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowUpRight, Building2, CalendarDays, ChartNoAxesCombined,
  Check, CheckCircle2, ChevronRight, CircleHelp, FileSpreadsheet,
  LayoutDashboard, ListChecks, Menu, PanelLeftClose, ShieldCheck, X
} from 'lucide-react';
import StatusPill from './components/StatusPill.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ChecklistPage from './pages/ChecklistPage.jsx';
import BusinessUnitsPage from './pages/BusinessUnitsPage.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import DataSourcePage from './pages/DataSourcePage.jsx';

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

const emptyBusinessUnit = {
  BUSINESS_UNIT_ID: '', BUSINESS_UNIT_NAME: '', LEGAL_ENTITY_ID: '', LEGAL_ENTITY_NAME: '',
  LEDGER_ID: '', LEDGER_NAME: '', CURRENCY_CODE: '', CUTOFF_DATE: '', DUE_DAYS: ''
};

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
    } catch {
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

function compareChecklistTasks(a, b) {
  return Number(a.checklistRowId) - Number(b.checklistRowId) ||
    a.entity.localeCompare(b.entity);
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
  const [businessUnitForm,setBusinessUnitForm] = useState(emptyBusinessUnit);
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
        if (!cancelled) setTasks(data.tasks);
      } catch (error) {
        if (!cancelled) setApiError(`Could not load tasks from Application: ${error.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadTasks();
    return () => { cancelled = true; };
  }, [reloadCount]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

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
  const visibleTasks = useMemo(() => applicable.filter(task =>
    (selectedEntity === 'ALL' || task.businessUnitId === selectedEntity) &&
    (statusFilter === 'All statuses' || task.status === statusFilter) &&
    (moduleFilter === 'All modules' || task.module === moduleFilter) &&
    [task.title,task.module,task.owner,task.entity,task.legalEntityName]
      .filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase())
  ).sort(compareChecklistTasks),[applicable,selectedEntity,statusFilter,moduleFilter,search]);

  const completedCount = applicable.filter(task=>task.status==='Complete').length;
  const inProgressCount = applicable.filter(task=>task.status==='In progress').length;
  const blockedCount = applicable.filter(task=>task.status==='Blocked').length;
  const pendingCount = applicable.filter(task=>task.status==='Not started').length;
  const completion = applicable.length ? Math.round(completedCount/applicable.length*100) : 0;
  const scopedBusinessUnits = businessUnits.filter(record =>
    selectedLegalEntity === 'ALL' || record.LEGAL_ENTITY_NAME === selectedLegalEntity
  );
  const mappingBusinessUnits = scopedBusinessUnits.map((record, index) => ({
    id: record.MAPPING_ID ? `mapping:${record.MAPPING_ID}` : `mapping:${record.BUSINESS_UNIT_ID}:${record.LEGAL_ENTITY_ID}:${record.LEDGER_ID}:${index}`,
    name: record.BUSINESS_UNIT_NAME || record.BUSINESS_UNIT_ID || 'Unassigned',
    mappingRecord: record
  }));
  const businessUnitCards = mappingBusinessUnits.map(entity=>{
    const list = applicable.filter(task =>
      task.businessUnitId === entity.mappingRecord.BUSINESS_UNIT_NAME ||
      task.entity === entity.mappingRecord.BUSINESS_UNIT_NAME
    );
    const done = list.filter(task=>task.status==='Complete').length;
    const inProgress = list.filter(task=>task.status==='In progress').length;
    const blocked = list.filter(task=>task.status==='Blocked').length;
    return { ...entity, total: list.length, done, inProgress, blocked, pending: list.length-done-inProgress-blocked, pct: list.length ? Math.round(done/list.length*100) : 0 };
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
  const entityStats = [...new Map(dashboardUnits.map(unit => [unit.id, unit])).values()].map(entity=>{
    const list = applicable.filter(task=>task.businessUnitId===entity.id || task.entity===entity.name);
    const done = list.filter(task=>task.status==='Complete').length;
    const inProgress = list.filter(task=>task.status==='In progress').length;
    const blocked = list.filter(task=>task.status==='Blocked').length;
    return { ...entity, total: list.length, done, inProgress, blocked, pending: list.length-done-inProgress-blocked, pct: list.length ? Math.round(done/list.length*100) : 0 };
  });
  const fullyClosed = entityStats.filter(entity=>entity.total>0 && entity.done===entity.total).length;
  const modules = [...new Set(applicable.map(task=>task.module))].sort();
  const checklistRows = [...new Map(applicable.map(task=>[task.checklistRowId,task])).values()]
    .sort(compareChecklistTasks);

  const updateTask = (id,patch) => {
    setDetailTask(previous=>previous && previous.id===id?{...previous,...patch}:previous);
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
      setTasks(previous=>previous.map(task=>task.id===savedTask.id?{...task,...savedTask}:task));
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
    setBusinessUnitForm(record || emptyBusinessUnit);
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
    visibleTasks.forEach(task=>{
      rows.push([task.checklistRowId,task.moduleName,task.entity,task.legalEntityName,task.processOwner,task.title,task.stepComment,task.actionBy,task.prerequisiteDescription,task.actionType,task.processType,task.status,task.owner,task.note||'']);
    });
    const csv = rows.map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download='operational-checklist.csv';
    link.click();
    URL.revokeObjectURL(url);
    setToast('Checklist exported to CSV');
  };

  const pageTitle = page === 'dataSource' ? 'Data source' : navItems.find(item=>item.id===page)?.label || 'Dashboard';

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
        {page==='dashboard' && <DashboardPage
          completion={completion} completedCount={completedCount}
          inProgressCount={inProgressCount} blockedCount={blockedCount} pendingCount={pendingCount}
          fullyClosed={fullyClosed} moduleCount={modules.length} entityStats={entityStats}
          legalEntityOptions={legalEntityOptions} selectedLegalEntity={selectedLegalEntity}
          onSelectLegalEntity={name=>{setSelectedLegalEntity(name);setSelectedEntity('ALL');}}
          applicable={applicable} onGoChecklist={()=>setPage('checklist')}
          onSelectEntity={id=>{setSelectedEntity(id);setPage('checklist');}}
          onViewEntities={()=>setPage('entities')} onOpenTask={task=>setDetailTask(task)}
        />}
        {page==='checklist' && <ChecklistPage
          completedCount={completedCount} inProgressCount={inProgressCount}
          pendingCount={pendingCount} blockedCount={blockedCount} exportCsv={exportCsv}
          search={search} setSearch={setSearch} selectedEntity={selectedEntity}
          setSelectedEntity={setSelectedEntity} businessUnitOptions={businessUnitOptions}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          moduleFilter={moduleFilter} setModuleFilter={setModuleFilter} modules={modules}
          visibleTasks={visibleTasks} applicable={applicable} onOpenTask={setDetailTask}
        />}
        {page==='entities' && <BusinessUnitsPage
          businessUnitsLoading={businessUnitsLoading} businessUnits={businessUnits}
          businessUnitCards={businessUnitCards} businessUnitLoadError={businessUnitLoadError}
          reload={()=>setReloadCount(count=>count+1)} openBusinessUnitEditor={openBusinessUnitEditor}
          selectedBusinessUnitId={selectedBusinessUnitId} setSelectedBusinessUnitId={setSelectedBusinessUnitId}
          exportCsv={exportCsv}
        />}
        {page==='calendar' && <CalendarPage checklistRows={checklistRows} exportCsv={exportCsv}/>}
        {page==='reports' && <ReportsPage
          completion={completion} completedCount={completedCount} inProgressCount={inProgressCount}
          blockedCount={blockedCount} pendingCount={pendingCount} applicable={applicable}
          fullyClosed={fullyClosed} entityStats={entityStats} modules={modules}
          exportCsv={exportCsv} setPage={setPage} onOpenTask={setDetailTask}
        />}
        {page==='dataSource' && <DataSourcePage
          template={uploadTemplates[dataSource]} downloadTemplate={downloadUploadTemplate}
          selectFile={selectUploadFile} submitUpload={submitUpload} uploadRows={uploadRows}
          uploading={uploading} uploadFileName={uploadFileName} uploadError={uploadError}
        />}
      </div>
      <footer className="app-footer"><span>CloseControl <span className="footer-dot">•</span> Finance Close & Project Accounting Control Tower</span></footer>
    </main>

    {detailTask && <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setDetailTask(null)}}><div className="detail-drawer">
      <div className="drawer-head"><div><div className="eyebrow">TASK DETAILS</div><h2>Close activity</h2></div><button className="icon-btn" onClick={()=>setDetailTask(null)}><X size={19}/></button></div>
      <div className="drawer-body">
        {apiError && <p className="form-error" role="alert">{apiError}</p>}
        <span className="module-chip">{detailTask.module}</span><h3 className="drawer-task-title">{detailTask.title}</h3><div className="drawer-status-row"><StatusPill status={detailTask.status}/></div>
        <label className="field-label">Business unit</label><p>{detailTask.entity}</p>
        {detailTask.legalEntityName && <><label className="field-label">Legal entity</label><p>{detailTask.legalEntityName}</p></>}
        {detailTask.processOwner && <><label className="field-label">Source process owner</label><p>{detailTask.processOwner}</p></>}
        {detailTask.actionBy && <><label className="field-label">Action by</label><p>{detailTask.actionBy}</p></>}
        <label className="field-label">Task status</label><select className="field-control" value={detailTask.status} onChange={event=>updateTask(detailTask.id,{status:event.target.value})}><option>Not started</option><option>In progress</option><option>Blocked</option><option>Complete</option></select>
        <label className="field-label">Owner / team</label><input className="field-control" value={detailTask.owner} onChange={event=>updateTask(detailTask.id,{owner:event.target.value})}/>
        <label className="field-label">Comments / blockers</label><textarea className="field-control textarea" rows="4" placeholder="Add progress notes, blockers or handover comments..." value={detailTask.note||''} onChange={event=>updateTask(detailTask.id,{note:event.target.value})}/>
        {detailTask.prerequisiteDescription && <><label className="field-label">Prerequisite description</label><p>{detailTask.prerequisiteDescription}</p></>}
        {detailTask.actionType && <><label className="field-label">Action type</label><p>{detailTask.actionType}</p></>}
        {detailTask.processType && <><label className="field-label">Process type</label><p>{detailTask.processType}</p></>}
        <div className="drawer-note"><ShieldCheck size={16}/><span>Workflow status, owner and comments are stored separately from the source checklist.</span></div>
      </div>
      <div className="drawer-footer"><button className="btn secondary" onClick={()=>setDetailTask(null)}>Cancel</button><button className="btn primary" onClick={saveTask} disabled={saving}><Check size={16}/>{saving?'Saving…':'Save changes'}</button></div>
    </div></div>}

    {businessUnitEditor !== null && <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setBusinessUnitEditor(null)}}><div className="detail-drawer business-unit-drawer">
      <div className="drawer-head"><div><div className="eyebrow">BUSINESS UNIT RECORD</div><h2>{businessUnitForm.BUSINESS_UNIT_NAME ? 'Update mapping' : 'Add business unit'}</h2></div><button className="icon-btn" onClick={()=>setBusinessUnitEditor(null)}><X size={19}/></button></div>
      <div className="drawer-body business-unit-form-body">
        {businessUnitError && <p className="form-error" role="alert">{businessUnitError}</p>}
        <div className="field-grid">
          <div><label className="field-label">Business unit ID</label><input className="field-control" value={businessUnitForm.BUSINESS_UNIT_ID} onChange={event=>updateBusinessUnitField('BUSINESS_UNIT_ID', event.target.value)}/></div>
          <div><label className="field-label">Business unit name</label><input className="field-control" value={businessUnitForm.BUSINESS_UNIT_NAME} onChange={event=>updateBusinessUnitField('BUSINESS_UNIT_NAME', event.target.value)}/></div>
          <div><label className="field-label">Legal entity ID</label><input className="field-control" value={businessUnitForm.LEGAL_ENTITY_ID} onChange={event=>updateBusinessUnitField('LEGAL_ENTITY_ID', event.target.value)}/></div>
          <div><label className="field-label">Legal entity name</label><input className="field-control" value={businessUnitForm.LEGAL_ENTITY_NAME} onChange={event=>updateBusinessUnitField('LEGAL_ENTITY_NAME', event.target.value)}/></div>
          <div><label className="field-label">Ledger ID</label><input className="field-control" value={businessUnitForm.LEDGER_ID} onChange={event=>updateBusinessUnitField('LEDGER_ID', event.target.value)}/></div>
          <div><label className="field-label">Ledger name</label><input className="field-control" value={businessUnitForm.LEDGER_NAME} onChange={event=>updateBusinessUnitField('LEDGER_NAME', event.target.value)}/></div>
          <div><label className="field-label">Currency code</label><input className="field-control" value={businessUnitForm.CURRENCY_CODE} onChange={event=>updateBusinessUnitField('CURRENCY_CODE', event.target.value)}/></div>
          <div><label className="field-label">Cutoff date</label><input className="field-control" type="date" value={businessUnitForm.CUTOFF_DATE} onChange={event=>updateBusinessUnitField('CUTOFF_DATE', event.target.value)}/></div>
          <div><label className="field-label">Due days</label><input className="field-control" type="number" value={businessUnitForm.DUE_DAYS} onChange={event=>updateBusinessUnitField('DUE_DAYS', event.target.value)}/></div>
        </div>
      </div>
      <div className="drawer-footer"><button className="btn secondary" onClick={()=>setBusinessUnitEditor(null)}>Cancel</button><button className="btn primary" onClick={saveBusinessUnitRecord} disabled={businessUnitSaving}><Check size={16}/>{businessUnitSaving?'Saving…':'Save mapping'}</button></div>
    </div></div>}

    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}<button onClick={()=>setToast('')}><X size={15}/></button></div>}
  </div>;
}
