import {
  Activity, AlertTriangle, ArrowUpRight, Building2, CalendarDays, ChartNoAxesCombined,
  Check, CheckCircle2, ChevronRight, Clock3, ListChecks, ShieldCheck, Sparkles
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
  fullyClosed, moduleCount, entityStats, applicable,
  selectedLedger, selectedPeriod, onGoChecklist, onSelectEntity,
  onViewEntities, onOpenTask
}) {
  const openTasks = applicable.filter(task=>task.status!=='Complete');
  const attention = applicable.filter(task=>task.status==='Blocked').slice(0,5);
  const schedule = [...new Map(applicable.map(task=>[task.checklistRowId,task])).values()]
    .sort(compareChecklistTasks)
    .slice(0,5);

  return <section className="page-section">
    <div className="welcome-row"><div><div className="eyebrow">GROUP FINANCE / CLOSE MANAGEMENT</div><h1>Operational checklist overview</h1><p>{selectedLedger ? <>Ledger <strong>{selectedLedger}</strong> · Period <strong>{selectedPeriod}</strong></> : 'Select a ledger to view its close activities.'}</p></div><div className="welcome-actions"><button className="btn primary" onClick={onGoChecklist}><ListChecks size={16}/> Open checklist</button></div></div>
    <div className="callout"><div className="callout-icon"><Sparkles size={19}/></div><div className="callout-copy"><strong>Selected-period overview</strong><p>{completion}% of {applicable.length} checklist activities are complete for <b>{selectedLedger || 'the selected ledger'}</b> in <b>{selectedPeriod}</b>. <b>{blockedCount} activities</b> are blocked and need review.</p></div><button className="callout-link" onClick={onGoChecklist}>Review tasks <ArrowUpRight size={14}/></button></div>
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
          {entityStats.slice(0,7).map(entity=><button className="entity-table-row" key={entity.id} onClick={()=>onSelectEntity(entity.id)}><div className="entity-cell"><div className="entity-mini-icon"><Building2 size={16}/></div><div><strong>{entity.name}</strong><small>{entity.legalEntityName || 'Business unit'}</small></div></div><div className="entity-progress-cell"><div className="entity-progress-text"><strong>{entity.pct}%</strong><small>{entity.done}/{entity.total} tasks</small></div><Progress value={entity.pct} color={entity.pct===100?'green':'blue'}/></div><div className="entity-status-cell">{entity.pct===100?<StatusPill status="Complete"/>:entity.blocked>0?<StatusPill status="Blocked"/>:<StatusPill status={entity.inProgress>0?'In progress':'Not started'}/>}</div></button>)}
        </div><button className="panel-bottom-link" onClick={onViewEntities}>View all {entityStats.length} business units <ChevronRight size={15}/></button>
      </div>
      <div className="panel attention-panel">
        <div className="panel-heading"><div><h2>Blocked activities</h2><p>Activities currently marked blocked</p></div><span className="attention-count">{blockedCount}</span></div>
        {attention.length===0?<div className="no-attention"><CheckCircle2 size={27}/><strong>No blocked activities</strong><p>There are no blocked activities in the current checklist data.</p></div>:<div className="attention-list">{attention.map(task=><button className="attention-item" key={task.id} onClick={()=>onOpenTask(task)}><span className="attention-alert red"><AlertTriangle size={16}/></span><span className="attention-copy"><strong>{task.title}</strong><small>{task.entity} · {task.owner}</small></span><ChevronRight size={16}/></button>)}</div>}
        <button className="panel-bottom-link" onClick={onGoChecklist}>View all open activities <ChevronRight size={15}/></button>
      </div>
    </div>
    <div className="bottom-grid">
      <div className="panel"><div className="panel-heading"><div><h2>Close progress</h2><p>Overall activity status</p></div><span className="panel-icon"><Activity size={18}/></span></div><div className="big-progress"><div className="big-progress-value">{completion}%</div><div className="big-progress-copy"><strong>Activities completed</strong><span>{completedCount} completed out of {applicable.length} tasks</span></div></div><Progress value={completion} color="green"/><div className="status-metrics"><div><span className="legend-dot green"/><span>Complete</span><strong>{completedCount}</strong></div><div><span className="legend-dot blue"/><span>In progress</span><strong>{inProgressCount}</strong></div><div><span className="legend-dot amber"/><span>Not started</span><strong>{pendingCount}</strong></div><div><span className="legend-dot red"/><span>Blocked</span><strong>{blockedCount}</strong></div></div></div>
      <div className="panel"><div className="panel-heading"><div><h2>Source checklist</h2><p>Activities recorded in Application</p></div><span className="panel-icon"><CalendarDays size={18}/></span></div><div className="milestone-list">{schedule.map((task,index)=><div className="milestone" key={task.checklistRowId}><div className={`milestone-check ${task.status==='Complete'?'done':''}`}>{task.status==='Complete'?<Check size={13}/>:index+1}</div><div className="milestone-copy"><strong>{task.title}</strong><small>{task.module} · {task.status}</small></div><span className="milestone-day">{task.entity}</span></div>)}</div></div>
    </div>
  </section>;
}
