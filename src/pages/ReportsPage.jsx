import {
  Activity, AlertTriangle, ArrowUpRight, CalendarRange, ChartNoAxesCombined,
  ChevronRight, CircleAlert, Download, Landmark
} from 'lucide-react';
import StatCard from '../components/StatCard.jsx';
import StatusPill from '../components/StatusPill.jsx';

export default function ReportsPage({
  completion, completedCount, inProgressCount, blockedCount, pendingCount,
  applicable, ledgerStats, modules, exportCsv, setPage, onOpenTask,
  scopeLabel, loading, error, onRetry
}) {
  const fullyClosed = ledgerStats.filter(ledger=>ledger.total>0&&ledger.done===ledger.total).length;
  return <section className="page-section">
    <div className="page-heading"><div><div className="eyebrow">PERFORMANCE & INSIGHTS</div><h1>Reports & analytics</h1><p>Ledger close performance and risks for {scopeLabel}.</p></div><button className="btn primary" onClick={exportCsv}><Download size={16}/> Export report</button></div>
    {error&&<div className="form-error business-unit-load-error" role="alert"><span>{error}</span><button className="btn secondary compact" onClick={onRetry} disabled={loading}>Retry</button></div>}
    {loading&&<div className="api-loading" role="status">Loading Ledger activity reports…</div>}
    {!loading&&!error&&<><div className="stats-grid"><StatCard label="Overall completion" value={`${completion}%`} sub={`${completedCount} of ${applicable.length} Ledger activities`} icon={ChartNoAxesCombined} tone="blue"/><StatCard label="Ledgers fully closed" value={`${fullyClosed} / ${ledgerStats.length}`} sub="All unique Ledger activities complete" icon={Landmark} tone="green"/><StatCard label="Checklist modules" value={modules.length} sub="Distinct modules in Ledger activities" icon={CalendarRange} tone="amber"/><StatCard label="Blocked activities" value={blockedCount} sub="Requires intervention" icon={CircleAlert} tone="red"/></div>
    <div className="reports-grid"><div className="panel"><div className="panel-heading"><div><h2>Ledger completion</h2><p>Completion rate by Ledger</p></div><span className="panel-icon"><ChartNoAxesCombined size={18}/></span></div><div className="bar-chart">{ledgerStats.map(ledger=><div className="bar-row" key={ledger.id}><span title={ledger.name}>{ledger.name}</span><div className="bar-bg"><div className="bar-fill" style={{width:`${ledger.pct}%`}}/></div><strong>{ledger.pct}%</strong></div>)}</div></div>
      <div className="panel"><div className="panel-heading"><div><h2>Task status mix</h2><p>Current operational checklist instances</p></div><span className="panel-icon"><Activity size={18}/></span></div><div className="status-breakdown"><div className="donut-wrap"><div className="donut" style={{background:`conic-gradient(#1b9875 0 ${completedCount/Math.max(applicable.length,1)*100}%, #4b88d2 ${completedCount/Math.max(applicable.length,1)*100}% ${(completedCount+inProgressCount)/Math.max(applicable.length,1)*100}%, #d99a2b ${(completedCount+inProgressCount)/Math.max(applicable.length,1)*100}% ${(completedCount+inProgressCount+pendingCount)/Math.max(applicable.length,1)*100}%, #d75d5d ${(completedCount+inProgressCount+pendingCount)/Math.max(applicable.length,1)*100}% 100%)`}}><div className="donut-hole"><strong>{completion}%</strong><span>Complete</span></div></div></div><div className="legend">{[['Complete',completedCount,'green'],['In progress',inProgressCount,'blue'],['Not started',pendingCount,'amber'],['Blocked',blockedCount,'red']].map(([label,count,color])=><div className="legend-item" key={label}><span className={`legend-dot ${color}`}/><span>{label}</span><strong>{count}</strong></div>)}</div></div></div></div>
    <div className="panel attention-panel"><div className="panel-heading"><div><h2>Blocked activities</h2><p>Blocked Ledger activities across {scopeLabel}</p></div><button className="text-btn" onClick={()=>setPage('checklist')}>View checklist <ArrowUpRight size={14}/></button></div><div className="attention-list">{applicable.filter(task=>task.status==='Blocked').slice(0,7).map(task=><button key={`${task.ledgerId}|${task.checklistRowId}`} className="attention-item" onClick={()=>onOpenTask(task)}><span className="attention-alert red"><AlertTriangle size={16}/></span><span className="attention-copy"><strong>{task.title}</strong><small>{task.ledgerName || task.ledgerId} · {task.owner}</small></span><StatusPill status={task.status}/><ChevronRight size={16}/></button>)}</div></div></>}
  </section>;
}
