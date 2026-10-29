import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowUpRight, CalendarDays, ChartNoAxesCombined,
  Check, CheckCircle2, ChevronRight, CircleHelp, FileSpreadsheet,
  Landmark, LayoutDashboard, ListChecks, Menu, PanelLeftClose, ShieldCheck, X
} from 'lucide-react';
import StatusPill from './components/StatusPill.jsx';
import SearchableSelect from './components/SearchableSelect.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ChecklistPage from './pages/ChecklistPage.jsx';
import LedgerOverviewPage from './pages/LedgerOverviewPage.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import DataSourcePage from './pages/DataSourcePage.jsx';

const uploadTemplates = {
  checklist: {
    label: 'Operational checklist',
    fileName: 'operational-checklist-template.csv',
    tableName: 'XX_OPERATIONAL_CHECKLIST',
    required: 'LEDGER_NAME, PROCESS_NAME',
    columns: [
      'MODULE_NAME', 'LEDGER_NAME', 'PROCESS_OWNER',
      'PROCESS_NAME', 'PROCESS_DESCRIPTION', 'ACTION_BY', 'PRE_REQUISITE_DESC',
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
  { id:'entities', label:'Ledger', icon:Landmark },
  { id:'calendar', label:'Checklist sequence', icon:CalendarDays },
  { id:'reports', label:'Reports & analytics', icon:ChartNoAxesCombined }
];

function parseCsv(text, expectedColumns, legacyColumns = []) {
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
  const hasLegacyColumns = legacyColumns.length > 0 &&
    headers.length === expectedColumns.length + legacyColumns.length &&
    legacyColumns.every(column => headers.includes(column));
  if ((!hasLegacyColumns && headers.length !== expectedColumns.length) ||
      new Set(headers).size !== headers.length ||
      expectedColumns.some(column => !headers.includes(column))) {
    throw new Error('The header row does not match the selected data-source template.');
  }
  const rowColumns = headers.filter(header => !legacyColumns.includes(header));

  const rows = records.slice(1).map((cells, index) => {
    if (cells.length !== headers.length) {
      throw new Error(`Row ${index + 2} has ${cells.length} columns; expected ${headers.length}.`);
    }
    return Object.fromEntries(rowColumns.map(header => [
      header,
      cells[headers.indexOf(header)].trim()
    ]));
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

function summarizeLedgerTasks(ledger, mappings, tasks) {
  const activities = [...new Map(tasks.map(task => [task.checklistRowId, task])).values()];
  const completedCount = activities.filter(task => task.status === 'Complete').length;
  const inProgressCount = activities.filter(task => task.status === 'In progress').length;
  const blockedCount = activities.filter(task => task.status === 'Blocked').length;
  const pendingCount = activities.filter(task => task.status === 'Not started').length;
  const cutoffDates = [...new Set(mappings.map(record => record.CUTOFF_DATE).filter(Boolean))];
  const dueDays = [...new Set(mappings.map(record => record.DUE_DAYS).filter(Boolean))];
  const completion = activities.length
    ? Math.round(completedCount / activities.length * 100)
    : 0;

  return {
    ledgerId: ledger.id,
    ledgerName: ledger.name,
    mappingCount: mappings.length,
    activityCount: activities.length,
    completedCount,
    inProgressCount,
    blockedCount,
    pendingCount,
    openCount: activities.length - completedCount,
    completion,
    status: completion === 100 && activities.length > 0
      ? 'Complete'
      : blockedCount > 0
        ? 'Blocked'
        : inProgressCount > 0
          ? 'In progress'
          : 'Not started',
    moduleCount: new Set(activities.map(task => task.module)).size,
    cutoffDate: cutoffDates.length === 1 ? cutoffDates[0] : '',
    dueDays: dueDays.length === 1 ? dueDays[0] : '',
    cutoffDateMixed: cutoffDates.length > 1,
    dueDaysMixed: dueDays.length > 1
  };
}

function formatPeriodKey(date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
}

function formatPeriodInput(period) {
  const numericMatch = period.match(/^(\d{2})-(\d{4})$/);
  if (numericMatch) return `${numericMatch[2]}-${numericMatch[1]}`;

  const legacyMatch = period.match(/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-(\d{4})$/);
  if (!legacyMatch) return '';
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${legacyMatch[2]}-${String(months.indexOf(legacyMatch[1]) + 1).padStart(2, '0')}`;
}

function parsePeriodInput(value) {
  const match = value.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  return match ? `${match[2]}-${match[1]}` : '';
}

function formatPeriodLabel(period) {
  const numericMatch = period.match(/^(0[1-9]|1[0-2])-(\d{4})$/);
  if (numericMatch) {
    const month = new Intl.DateTimeFormat('en', { month: 'short' })
      .format(new Date(Number(numericMatch[2]), Number(numericMatch[1]) - 1, 1))
      .toUpperCase();
    return `${month} ${numericMatch[2]}`;
  }
  const legacyMatch = period.match(/^([A-Z]{3})-(\d{4})$/);
  return legacyMatch ? `${legacyMatch[1]} ${legacyMatch[2]}` : period;
}

export default function App() {
  const [tasks,setTasks] = useState([]);
  const [allLedgerTasks,setAllLedgerTasks] = useState([]);
  const [allLedgerTasksLoading,setAllLedgerTasksLoading] = useState(false);
  const [allLedgerTasksError,setAllLedgerTasksError] = useState('');
  const [loading,setLoading] = useState(true);
  const [apiError,setApiError] = useState('');
  const [reloadCount,setReloadCount] = useState(0);
  const [saving,setSaving] = useState(false);
  const [page,setPage] = useState('dashboard');
  const [selectedLedgerId,setSelectedLedgerId] = useState('');
  const [showAllLedgers,setShowAllLedgers] = useState(true);
  const [selectedPeriod,setSelectedPeriod] = useState(() => formatPeriodKey(new Date()));
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
  const [ledgerOverviews,setLedgerOverviews] = useState([]);
  const [ledgerOverviewsLoading,setLedgerOverviewsLoading] = useState(true);
  const [ledgerOverviewsError,setLedgerOverviewsError] = useState('');

  useEffect(() => {
    if (businessUnitsLoading || !selectedLedgerId) {
      if (!selectedLedgerId) {
        setTasks([]);
        setApiError('');
      }
      if (!businessUnitsLoading) setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const loadTasks = async () => {
      setLoading(true);
      setTasks([]);
      setApiError('');
      try {
        const query = new URLSearchParams({ ledgerId: selectedLedgerId, period: selectedPeriod });
        const data = await apiRequest(`/tasks?${query}`);
        if (!Array.isArray(data.tasks) || !Array.isArray(data.periods)) {
          throw new Error('Application returned an unexpected checklist or period response.');
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
  }, [reloadCount, selectedLedgerId, selectedPeriod, businessUnitsLoading]);

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

  useEffect(() => {
    if (businessUnitsLoading) return;
    if (businessUnits.length === 0) {
      if (selectedLedgerId) setSelectedLedgerId('');
      return;
    }
    if (showAllLedgers && !selectedLedgerId) return;
    const ledgerExists = businessUnits.some(record => record.LEDGER_ID === selectedLedgerId);
    if (!selectedLedgerId || !ledgerExists) {
      setSelectedLedgerId(businessUnits[0].LEDGER_ID);
    }
  }, [businessUnits, businessUnitsLoading, selectedLedgerId, showAllLedgers]);

  useEffect(() => {
    if (businessUnitsLoading) return undefined;
    let cancelled = false;
    const loadLedgerOverviews = async () => {
      setLedgerOverviewsLoading(true);
      setLedgerOverviewsError('');
      try {
        const query = new URLSearchParams({ period: selectedPeriod });
        let summaries;
        try {
          const data = await apiRequest(`/ledger-overviews?${query}`);
          if (!Array.isArray(data.ledgers)) {
            throw new Error('Application returned an unexpected Ledger overview response.');
          }
          summaries = data.ledgers;
        } catch (error) {
          if (!error.message.includes('API route not found.')) throw error;

          const mappingsByLedger = new Map();
          businessUnits.filter(record => record.LEDGER_ID).forEach(record => {
            const existing = mappingsByLedger.get(record.LEDGER_ID) || [];
            existing.push(record);
            mappingsByLedger.set(record.LEDGER_ID, existing);
          });
          const fallbackLedgers = [...mappingsByLedger.entries()].map(([id, mappings]) => ({
            id,
            name: mappings[0].LEDGER_NAME || id,
            mappings
          }));
          summaries = await Promise.all(fallbackLedgers.map(async ledger => {
            const taskQuery = new URLSearchParams({ ledgerId: ledger.id, period: selectedPeriod });
            const taskData = await apiRequest(`/tasks?${taskQuery}`);
            if (!Array.isArray(taskData.tasks)) {
              throw new Error(`Application returned an unexpected task response for Ledger ${ledger.name}.`);
            }
            return summarizeLedgerTasks(ledger, ledger.mappings, taskData.tasks);
          }));
        }
        if (!cancelled) setLedgerOverviews(summaries);
      } catch (error) {
        if (!cancelled) {
          setLedgerOverviews([]);
          setLedgerOverviewsError(`Could not load Ledger overviews from Application: ${error.message}`);
        }
      } finally {
        if (!cancelled) setLedgerOverviewsLoading(false);
      }
    };
    loadLedgerOverviews();
    return () => { cancelled = true; };
  }, [reloadCount, selectedPeriod, businessUnits, businessUnitsLoading]);

  useEffect(() => {
    if (!showAllLedgers || businessUnitsLoading) {
      setAllLedgerTasks([]);
      setAllLedgerTasksError('');
      setAllLedgerTasksLoading(false);
      return undefined;
    }

    let cancelled = false;
    const loadAllLedgerTasks = async () => {
      setAllLedgerTasksLoading(true);
      setAllLedgerTasksError('');
      try {
        const mappingsByLedger = new Map();
        businessUnits.filter(record => record.LEDGER_ID).forEach(record => {
          const mappings = mappingsByLedger.get(record.LEDGER_ID) || [];
          mappings.push(record);
          mappingsByLedger.set(record.LEDGER_ID, mappings);
        });
        const ledgerTaskResults = await Promise.all([...mappingsByLedger.keys()].map(async ledgerId => {
          const query = new URLSearchParams({ ledgerId, period: selectedPeriod });
          const data = await apiRequest(`/tasks?${query}`);
          if (!Array.isArray(data.tasks)) {
            throw new Error(`Application returned an unexpected task response for Ledger ${ledgerId}.`);
          }
          return data.tasks;
        }));
        if (!cancelled) setAllLedgerTasks(ledgerTaskResults.flat());
      } catch (error) {
        if (!cancelled) {
          setAllLedgerTasks([]);
          setAllLedgerTasksError(`Could not load activities across all Ledgers: ${error.message}`);
        }
      } finally {
        if (!cancelled) setAllLedgerTasksLoading(false);
      }
    };
    loadAllLedgerTasks();
    return () => { cancelled = true; };
  }, [showAllLedgers, businessUnitsLoading, businessUnits, selectedPeriod, reloadCount]);

  const ledgerOptions = [...new Map(businessUnits
    .filter(record => record.LEDGER_ID)
    .map(record => [record.LEDGER_ID, { id: record.LEDGER_ID, name: record.LEDGER_NAME || record.LEDGER_ID }]))
    .values()].sort((a, b) => a.name.localeCompare(b.name));
  const applicable = tasks;
  const searchableLedgerOptions = [{ value: '__ALL__', label: 'All ledgers', detail: 'View all Ledger details' }, ...ledgerOptions.map(ledger => ({
    value: ledger.id,
    label: ledger.name,
    detail: ledger.id,
    searchText: ledger.id
  }))];
  const visibleTasks = useMemo(() => applicable.filter(task =>
    (statusFilter === 'All statuses' || task.status === statusFilter) &&
    (moduleFilter === 'All modules' || task.module === moduleFilter) &&
    [task.title,task.processDescription,task.module,task.owner,task.entity,task.legalEntityName,task.ledgerName]
      .filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase())
  ).sort(compareChecklistTasks),[applicable,statusFilter,moduleFilter,search]);

  const completedCount = applicable.filter(task=>task.status==='Complete').length;
  const inProgressCount = applicable.filter(task=>task.status==='In progress').length;
  const blockedCount = applicable.filter(task=>task.status==='Blocked').length;
  const pendingCount = applicable.filter(task=>task.status==='Not started').length;
  const completion = applicable.length ? Math.round(completedCount/applicable.length*100) : 0;
  const ledgerActivities = useMemo(() => [...new Map(applicable.map(task=>[task.checklistRowId,task])).values()]
    .sort(compareChecklistTasks),[applicable]);
  const allLedgerActivities = useMemo(() => [...new Map(allLedgerTasks.map(task=>[
    `${task.ledgerId}|${task.checklistRowId}`,
    task
  ])).values()].sort((a,b)=>
    String(a.ledgerName).localeCompare(String(b.ledgerName)) ||
    compareChecklistTasks(a,b)
  ),[allLedgerTasks]);
  const sequenceActivities = showAllLedgers ? allLedgerActivities : ledgerActivities;
  const ledgerActivityGroups = new Map();
  sequenceActivities.forEach(task => {
    const group = ledgerActivityGroups.get(task.ledgerId) || [];
    group.push(task);
    ledgerActivityGroups.set(task.ledgerId, group);
  });
  const reportLedgers = showAllLedgers
    ? ledgerOptions
    : ledgerOptions.filter(ledger => ledger.id === selectedLedgerId);
  const reportLedgerStats = reportLedgers.map(ledger => {
    const activities = ledgerActivityGroups.get(ledger.id) || [];
    const mappings = businessUnits.filter(record => record.LEDGER_ID === ledger.id);
    const summary = summarizeLedgerTasks(ledger, mappings, activities);
    return {
      id: ledger.id,
      name: ledger.name,
      pct: summary.completion,
      total: summary.activityCount,
      done: summary.completedCount
    };
  }).sort((a,b)=>a.name.localeCompare(b.name));
  const sequenceCompletedCount = sequenceActivities.filter(task=>task.status==='Complete').length;
  const sequenceInProgressCount = sequenceActivities.filter(task=>task.status==='In progress').length;
  const sequenceBlockedCount = sequenceActivities.filter(task=>task.status==='Blocked').length;
  const sequencePendingCount = sequenceActivities.filter(task=>task.status==='Not started').length;
  const sequenceCompletion = sequenceActivities.length
    ? Math.round(sequenceCompletedCount / sequenceActivities.length * 100)
    : 0;
  const sequenceModules = [...new Set(sequenceActivities.map(task=>task.module))].sort();
  const sequenceVisibleActivities = useMemo(() => sequenceActivities.filter(task =>
    (statusFilter === 'All statuses' || task.status === statusFilter) &&
    (moduleFilter === 'All modules' || task.module === moduleFilter) &&
    [task.title,task.processDescription,task.module,task.owner,task.ledgerName]
      .filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase())
  ),[sequenceActivities,statusFilter,moduleFilter,search]);
  const visibleLedgerActivities = useMemo(() => ledgerActivities.filter(task =>
    (statusFilter === 'All statuses' || task.status === statusFilter) &&
    (moduleFilter === 'All modules' || task.module === moduleFilter) &&
    [task.title,task.processDescription,task.module,task.owner,task.ledgerName]
      .filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase())
  ),[ledgerActivities,statusFilter,moduleFilter,search]);
  const ledgerCompletedCount = ledgerActivities.filter(task=>task.status==='Complete').length;
  const ledgerInProgressCount = ledgerActivities.filter(task=>task.status==='In progress').length;
  const ledgerBlockedCount = ledgerActivities.filter(task=>task.status==='Blocked').length;
  const ledgerPendingCount = ledgerActivities.filter(task=>task.status==='Not started').length;
  const ledgerCompletion = ledgerActivities.length
    ? Math.round(ledgerCompletedCount / ledgerActivities.length * 100)
    : 0;
  const selectedLedgerName = ledgerOptions.find(ledger=>ledger.id===selectedLedgerId)?.name || '';
  const ledgerStatus = ledgerCompletion === 100 && ledgerActivities.length > 0
    ? 'Complete'
    : ledgerBlockedCount > 0
      ? 'Blocked'
      : ledgerInProgressCount > 0
        ? 'In progress'
        : 'Not started';
  const ledgerStats = selectedLedgerId ? [{
    id: selectedLedgerId,
    name: selectedLedgerName || selectedLedgerId,
    legalEntityName: 'Selected ledger',
    total: ledgerActivities.length,
    done: ledgerCompletedCount,
    inProgress: ledgerInProgressCount,
    blocked: ledgerBlockedCount,
    pending: ledgerPendingCount,
    pct: ledgerCompletion
  }] : [];
  const scopedBusinessUnits = businessUnits.filter(record => record.LEDGER_ID === selectedLedgerId);
  const mappedCutoffDates = [...new Set(scopedBusinessUnits.map(record => record.CUTOFF_DATE).filter(Boolean))];
  const mappedDueDays = [...new Set(scopedBusinessUnits.map(record => record.DUE_DAYS).filter(Boolean))];
  const selectedLedgerCutoffDate = mappedCutoffDates.length === 1 ? mappedCutoffDates[0] : '';
  const selectedLedgerDueDays = mappedDueDays.length === 1 ? mappedDueDays[0] : '';
  const ledgerCutoffDateMixed = mappedCutoffDates.length > 1;
  const ledgerDueDaysMixed = mappedDueDays.length > 1;
  const dashboardUnits = [
    ...scopedBusinessUnits.map(record => ({
      id: record.BUSINESS_UNIT_ID,
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
    const list = applicable.filter(task=>task.businessUnitId===entity.id);
    const done = list.filter(task=>task.status==='Complete').length;
    const inProgress = list.filter(task=>task.status==='In progress').length;
    const blocked = list.filter(task=>task.status==='Blocked').length;
    return { ...entity, total: list.length, done, inProgress, blocked, pending: list.length-done-inProgress-blocked, pct: list.length ? Math.round(done/list.length*100) : 0 };
  });
  const modules = [...new Set(applicable.map(task=>task.module))].sort();

  const updateTask = (id,patch) => {
    setDetailTask(previous=>previous && previous.id===id?{...previous,...patch}:previous);
  };

  const saveTask = async () => {
    setSaving(true);
    setApiError('');
    try {
      const savedTask = await apiRequest(`/tasks/${encodeURIComponent(detailTask.checklistRowId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: detailTask.status,
          owner: detailTask.owner,
          note: detailTask.note || '',
          businessUnitId: detailTask.businessUnitId,
          ledgerId: detailTask.ledgerId,
          period: detailTask.period
        })
      });
      setTasks(previous=>previous.map(task=>task.id===savedTask.id?{...task,...savedTask}:task));
      setAllLedgerTasks(previous=>previous.map(task=>task.id===savedTask.id?{...task,...savedTask}:task));
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
      const rows = parseCsv(
        await file.text(),
        uploadTemplates[dataSource].columns,
        dataSource === 'checklist' ? ['LEGAL_ENTITY'] : []
      );
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

  const updateLedger = async ({ oldLedgerId = selectedLedgerId, ledgerId, ledgerName, cutoffDate, dueDays }) => {
    if (!oldLedgerId) throw new Error('Select a Ledger to update.');
    const result = await apiRequest(`/ledgers/${encodeURIComponent(oldLedgerId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ledgerId, ledgerName, cutoffDate, dueDays })
    });
    if (typeof result?.ledgerId !== 'string') {
      throw new Error('Application returned an unexpected Ledger update response.');
    }
    setSelectedLedgerId(result.ledgerId);
    setShowAllLedgers(false);
    setBusinessUnitsLoading(true);
    setDetailTask(null);
    setReloadCount(count => count + 1);
    setToast('Ledger and linked activity records updated.');
  };

  const createLedger = async record => {
    const payload = {
      ...record,
      LEDGER_ID: String(record.LEDGER_ID ?? '').trim(),
      LEDGER_NAME: String(record.LEDGER_NAME ?? '').trim(),
      BUSINESS_UNIT_ID: String(record.BUSINESS_UNIT_ID ?? '').trim(),
      BUSINESS_UNIT_NAME: String(record.BUSINESS_UNIT_NAME ?? '').trim(),
      LEGAL_ENTITY_ID: String(record.LEGAL_ENTITY_ID ?? '').trim(),
      LEGAL_ENTITY_NAME: String(record.LEGAL_ENTITY_NAME ?? '').trim(),
      CURRENCY_CODE: String(record.CURRENCY_CODE ?? '').trim(),
      CUTOFF_DATE: String(record.CUTOFF_DATE ?? '').trim(),
      DUE_DAYS: String(record.DUE_DAYS ?? '').trim()
    };
    const result = await apiRequest('/business-units', {
      method: 'POST',
      body: JSON.stringify({ record: payload, createLedger: true })
    });
    if (typeof result?.ledgerId !== 'string') {
      throw new Error('Application returned an unexpected Ledger creation response.');
    }
    setSelectedLedgerId(result.ledgerId);
    setShowAllLedgers(false);
    setBusinessUnitsLoading(true);
    setDetailTask(null);
    setReloadCount(count => count + 1);
    setToast('New Ledger and its first Business Unit mapping created.');
  };

  const exportCsv = (tasks = visibleTasks, ledgerScope = false) => {
    const rows = [ledgerScope
      ? ['CHECKLIST_ROW_ID','MODULE_NAME','LEDGER_ID','LEDGER_NAME','PROCESS_OWNER','PROCESS_NAME','PROCESS_DESCRIPTION','ACTION_BY','PRE_REQUISITE_DESC','ACTION_TYPE','PROCESS_TYPE','PERIOD','STATUS','ASSIGNED_USER','WORKFLOW_COMMENT']
      : ['CHECKLIST_ROW_ID','MODULE_NAME','LEDGER_NAME','BUSINESS_UNIT_ID','BUSINESS_UNIT_NAME','LEGAL_ENTITY','PROCESS_OWNER','PROCESS_NAME','PROCESS_DESCRIPTION','ACTION_BY','PRE_REQUISITE_DESC','ACTION_TYPE','PROCESS_TYPE','PERIOD','STATUS','ASSIGNED_USER','WORKFLOW_COMMENT']];
    tasks.forEach(task=>{
      rows.push(ledgerScope
        ? [task.checklistRowId,task.moduleName,task.ledgerId,task.ledgerName,task.processOwner,task.title,task.processDescription,task.actionBy,task.prerequisiteDescription,task.actionType,task.processType,selectedPeriod,task.status,task.owner,task.note||'']
        : [task.checklistRowId,task.moduleName,task.ledgerName,task.businessUnitId,task.entity,task.legalEntityName,task.processOwner,task.title,task.processDescription,task.actionBy,task.prerequisiteDescription,task.actionType,task.processType,selectedPeriod,task.status,task.owner,task.note||'']);
    });
    const csv = rows.map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download=ledgerScope?'ledger-operational-checklist.csv':'operational-checklist.csv';
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
          <item.icon size={18}/><span>{item.label}</span>{item.id==='checklist'&&<span className="nav-count">{ledgerPendingCount}</span>}
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
        <div className="topbar-right period-controls">
          <SearchableSelect
            label="LEDGER"
            ariaLabel="Ledger"
            options={searchableLedgerOptions}
            value={showAllLedgers?'__ALL__':selectedLedgerId}
            onChange={ledgerId=>{
              setDetailTask(null);
              if (ledgerId==='__ALL__') {
                setSelectedLedgerId('');
                setShowAllLedgers(true);
              } else {
                setShowAllLedgers(false);
                setSelectedLedgerId(ledgerId);
              }
            }}
            placeholder={businessUnitsLoading
              ? 'Loading ledgers...'
              : businessUnitLoadError
                ? 'Could not load ledgers'
                : ledgerOptions.length
                  ? 'Search ledger...'
                  : 'No ledger mappings'}
            disabled={businessUnitsLoading || ledgerOptions.length===0}
          />
          <label className="period-select month-period-select">
            <span>PERIOD</span>
            <input
              type="month"
              aria-label="Period"
              value={formatPeriodInput(selectedPeriod)}
              onChange={event => {
                const period = parsePeriodInput(event.target.value);
                if (period) {
                  setSelectedPeriod(period);
                  setDetailTask(null);
                }
              }}
            />
          </label>
        </div>
      </header>

      {businessUnitLoadError
        ? <div className="ledger-notice ledger-notice-error" role="alert">
          <span>{businessUnitLoadError}</span>
          <button className="btn secondary compact" onClick={()=>setReloadCount(count=>count+1)} disabled={businessUnitsLoading}>Retry</button>
        </div>
        : !businessUnitsLoading && ledgerOptions.length===0 && <div className="ledger-notice" role="status">
          <span>No ledger mappings are available. Upload Business Unit mappings to select a ledger and load checklist tasks.</span>
          <button className="btn secondary compact" onClick={()=>{setDataSource('mapping');setPage('dataSource');}}>Upload Business Units</button>
        </div>}

      {apiError && selectedLedgerId && <div className="api-error" role="alert"><span>{apiError}</span><button className="btn secondary compact" onClick={()=>setReloadCount(count=>count+1)} disabled={loading}>Retry</button></div>}
      {loading && selectedLedgerId && <div className="api-loading" role="status">Connecting to Application and loading close tasks…</div>}
      <div className={`page-content ${page==='entities' ? 'ledger-overview-content' : ''}`}>
        {page==='dashboard' && <DashboardPage
          completion={ledgerCompletion} completedCount={ledgerCompletedCount}
          inProgressCount={ledgerInProgressCount} blockedCount={ledgerBlockedCount} pendingCount={ledgerPendingCount}
          ledgerStatus={ledgerStatus} moduleCount={[...new Set(ledgerActivities.map(task=>task.module))].length}
          entityStats={ledgerStats}
          selectedLedger={selectedLedgerName}
          selectedPeriod={formatPeriodLabel(selectedPeriod)}
          applicable={ledgerActivities} onGoChecklist={()=>setPage('checklist')}
          onOpenTask={task=>setDetailTask(task)}
        />}
        {page==='checklist' && <ChecklistPage
          completedCount={ledgerCompletedCount} inProgressCount={ledgerInProgressCount}
          pendingCount={ledgerPendingCount} blockedCount={ledgerBlockedCount}
          exportCsv={()=>exportCsv(visibleLedgerActivities,true)}
          selectedPeriod={formatPeriodLabel(selectedPeriod)}
          search={search} setSearch={setSearch}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          moduleFilter={moduleFilter} setModuleFilter={setModuleFilter} modules={modules}
          visibleTasks={visibleLedgerActivities} applicable={ledgerActivities} onOpenTask={setDetailTask}
        />}
        {page==='entities' && <LedgerOverviewPage
          loading={!showAllLedgers && (businessUnitsLoading || loading)}
          error={!showAllLedgers ? businessUnitLoadError || apiError : ''}
          selectedLedger={selectedLedgerName} selectedLedgerId={selectedLedgerId}
          showAllLedgers={showAllLedgers} ledgers={ledgerOverviews}
          overviewsLoading={ledgerOverviewsLoading} overviewsError={ledgerOverviewsError}
          selectedPeriod={formatPeriodLabel(selectedPeriod)} status={ledgerStatus}
          completion={ledgerCompletion} completedCount={ledgerCompletedCount}
          openCount={ledgerActivities.length-ledgerCompletedCount}
          inProgressCount={ledgerInProgressCount} pendingCount={ledgerPendingCount}
          blockedCount={ledgerBlockedCount} activityCount={ledgerActivities.length}
          cutoffDate={selectedLedgerCutoffDate} dueDays={selectedLedgerDueDays}
          cutoffDateMixed={ledgerCutoffDateMixed} dueDaysMixed={ledgerDueDaysMixed}
          moduleCount={[...new Set(ledgerActivities.map(task=>task.module))].length}
          onRetry={()=>setReloadCount(count=>count+1)}
          onGoChecklist={()=>setPage('checklist')}
          onSelectLedger={ledgerId=>{setShowAllLedgers(false);setSelectedLedgerId(ledgerId);}}
          exportCsv={()=>exportCsv(visibleLedgerActivities,true)}
          onUpdateLedger={updateLedger} onCreateLedger={createLedger}
        />}
        {page==='calendar' && <CalendarPage
          checklistRows={sequenceVisibleActivities}
          exportCsv={()=>exportCsv(sequenceVisibleActivities,true)}
          scopeLabel={showAllLedgers ? 'All ledgers' : selectedLedgerName || selectedLedgerId}
          loading={showAllLedgers ? businessUnitsLoading || allLedgerTasksLoading : loading}
          error={showAllLedgers ? businessUnitLoadError || allLedgerTasksError : apiError}
          onRetry={()=>setReloadCount(count=>count+1)}
        />}
        {page==='reports' && <ReportsPage
          completion={sequenceCompletion} completedCount={sequenceCompletedCount}
          inProgressCount={sequenceInProgressCount} blockedCount={sequenceBlockedCount}
          pendingCount={sequencePendingCount} applicable={sequenceActivities}
          ledgerStats={reportLedgerStats} modules={sequenceModules}
          exportCsv={()=>exportCsv(sequenceActivities,true)} setPage={setPage} onOpenTask={setDetailTask}
          scopeLabel={showAllLedgers ? 'All ledgers' : selectedLedgerName || selectedLedgerId}
          loading={showAllLedgers ? businessUnitsLoading || allLedgerTasksLoading : loading}
          error={showAllLedgers ? businessUnitLoadError || allLedgerTasksError : apiError}
          onRetry={()=>setReloadCount(count=>count+1)}
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
        <label className="field-label">Ledger</label><p>{detailTask.ledgerName}</p>
        {detailTask.processDescription && <><label className="field-label">Process description</label><p>{detailTask.processDescription}</p></>}
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

    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}<button onClick={()=>setToast('')}><X size={15}/></button></div>}
  </div>;
}
