import {
  Activity, AlertTriangle, ArrowUpRight, CalendarDays, ChartNoAxesCombined,
  Check, CheckCircle2, ChevronRight, Clock3, Landmark, ListChecks, ShieldCheck
} from 'lucide-react';
import Progress from '../components/Progress.jsx';
import StatCard from '../components/StatCard.jsx';
import StatusPill from '../components/StatusPill.jsx';

function compareChecklistTasks(a, b) {
  return Number(a.checklistRowId) - Number(b.checklistRowId) ||
    a.entity.localeCompare(b.entity);
}

export default function DashboardPage({
  completion, completedCount, inProgressCount, blockedCount, pendingCount,
  ledgerStatus, moduleCount, entityStats, applicable,
  selectedLedger, selectedPeriod, onGoChecklist, onOpenTask
}) {
  const openTasks = applicable.filter(task=>task.status!=='Complete');
  const attention = applicable.filter(task=>task.status==='Blocked').slice(0,5);
  const schedule = [...applicable].sort(compareChecklistTasks).slice(0,5);

  return <section className="page-section">
    <div className="welcome-row"><div><div className="eyebrow">GROUP FINANCE / CLOSE MANAGEMENT</div><h1>Operational checklist overview</h1><p>{selectedLedger ? <>Ledger <strong>{selectedLedger}</strong> · Period <strong>{selectedPeriod}</strong> · All source activities for this ledger</> : 'Select a ledger to view its close activities.'}</p></div><div className="welcome-actions"><button className="btn primary" onClick={onGoChecklist}><ListChecks size={16}/> Open checklist</button></div></div>
    <div className="stats-grid dashboard-stats-grid">
      <StatCard label="Checklist completion" value={`${completion}%`} sub={`${completedCount} of ${applicable.length} ledger activities complete`} icon={ChartNoAxesCombined} tone="blue"/>
      <StatCard label="Selected ledger status" value={ledgerStatus} sub="Close status across ledger activities" icon={ShieldCheck} tone={ledgerStatus==='Complete'?'green':ledgerStatus==='Blocked'?'red':'amber'}/>
      <StatCard label="Open activities" value={openTasks.length.toLocaleString()} sub={`${inProgressCount} currently in progress`} icon={Clock3} tone="amber"/>
      <StatCard label="Checklist modules" value={moduleCount} sub="Distinct modules in the source rows" icon={AlertTriangle} tone="red"/>
    </div>
    <div className="dashboard-grid">
      <div className="panel entity-overview">
        <div className="panel-heading"><div><h2>Ledger overview</h2><p>Close progress for the selected ledger and period</p></div><button className="text-btn" onClick={onGoChecklist}>View activities <ArrowUpRight size={14}/></button></div>
        <div className="entity-table"><div className="entity-table-head"><span>LEDGER</span><span>PROGRESS</span><span>STATUS</span></div>
          {entityStats.map(entity=><button className="entity-table-row" key={entity.id} onClick={onGoChecklist}><div className="entity-cell"><div className="entity-mini-icon"><Landmark size={16}/></div><div><strong>{entity.name}</strong><small>{entity.legalEntityName}</small></div></div><div className="entity-progress-cell"><div className="entity-progress-text"><strong>{entity.pct}%</strong><small>{entity.done}/{entity.total} activities</small></div><Progress value={entity.pct} color={entity.pct===100?'green':'blue'}/></div><div className="entity-status-cell"><StatusPill status={entity.pct===100?'Complete':entity.blocked>0?'Blocked':entity.inProgress>0?'In progress':'Not started'}/></div></button>)}
          {entityStats.length===0&&<div className="empty-state">Select a ledger to view its activities.</div>}
        </div><button className="panel-bottom-link" onClick={onGoChecklist}>View all {applicable.length} ledger activities <ChevronRight size={15}/></button>
      </div>
      <div className="panel attention-panel">
        <div className="panel-heading"><div><h2>Blocked activities</h2><p>Activities marked blocked for {selectedLedger || 'the selected ledger'}</p></div><span className="attention-count">{blockedCount}</span></div>
        {attention.length===0?<div className="no-attention"><CheckCircle2 size={27}/><strong>No blocked activities</strong><p>There are no blocked activities in the current checklist data.</p></div>:<div className="attention-list">{attention.map(task=><button className="attention-item" key={task.id} onClick={()=>onOpenTask(task)}><span className="attention-alert red"><AlertTriangle size={16}/></span><span className="attention-copy"><strong>{task.title}</strong><small>{task.entity} · {task.owner}</small></span><ChevronRight size={16}/></button>)}</div>}
        <button className="panel-bottom-link" onClick={onGoChecklist}>View all open activities <ChevronRight size={15}/></button>
      </div>
    </div>
    <div className="bottom-grid">
      <div className="panel"><div className="panel-heading"><div><h2>Close progress</h2><p>Overall activity status for {selectedLedger || 'the selected ledger'}</p></div><span className="panel-icon"><Activity size={18}/></span></div><div className="big-progress"><div className="big-progress-value">{completion}%</div><div className="big-progress-copy"><strong>Activities completed</strong><span>{completedCount} completed out of {applicable.length} activities</span></div></div><Progress value={completion} color="green"/><div className="status-metrics"><div><span className="legend-dot green"/><span>Complete</span><strong>{completedCount}</strong></div><div><span className="legend-dot blue"/><span>In progress</span><strong>{inProgressCount}</strong></div><div><span className="legend-dot amber"/><span>Not started</span><strong>{pendingCount}</strong></div><div><span className="legend-dot red"/><span>Blocked</span><strong>{blockedCount}</strong></div></div></div>
      <div className="panel"><div className="panel-heading"><div><h2>Source checklist</h2><p>{selectedLedger ? `${selectedLedger} · ${selectedPeriod}` : 'Activities recorded in Application'}</p></div><span className="panel-icon"><CalendarDays size={18}/></span></div><div className="milestone-list">{schedule.map((task,index)=><div className="milestone" key={task.checklistRowId}><div className={`milestone-check ${task.status==='Complete'?'done':''}`}>{task.status==='Complete'?<Check size={13}/>:index+1}</div><div className="milestone-copy"><strong>{task.title}</strong><small>{task.module} · {task.status}</small></div><span className="milestone-day">{task.ledgerName || selectedLedger}</span></div>)}{schedule.length===0&&<div className="empty-state">No activities are configured for this ledger and period.</div>}</div></div>
    </div>
  </section>;
}
