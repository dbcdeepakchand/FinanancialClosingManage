import {
  Activity, AlertTriangle, ArrowUpRight, CalendarRange, ChartNoAxesCombined,
  ChevronRight,
  CircleAlert, Download, ShieldCheck
} from 'lucide-react';
import StatCard from '../components/StatCard.jsx';
import StatusPill from '../components/StatusPill.jsx';

export default function ReportsPage({
  completion, completedCount, inProgressCount, blockedCount, pendingCount,
  applicable, fullyClosed, entityStats, modules, exportCsv, setPage, onOpenTask
}) {
  return <section className="page-section">
    <div className="page-heading"><div><div className="eyebrow">PERFORMANCE & INSIGHTS</div><h1>Reports & analytics</h1><p>Review progress, workload and close execution risks.</p></div><button className="btn primary" onClick={exportCsv}><Download size={16}/> Export report</button></div>
    <div className="stats-grid"><StatCard label="Overall completion" value={`${completion}%`} sub={`${completedCount} of ${applicable.length} activities`} icon={ChartNoAxesCombined} tone="blue"/><StatCard label="Business units fully closed" value={`${fullyClosed} / ${entityStats.length}`} sub="All source business-unit/legal-entity rows complete" icon={ShieldCheck} tone="green"/><StatCard label="Checklist modules" value={modules.length} sub="Distinct modules in the source rows" icon={CalendarRange} tone="amber"/><StatCard label="Blocked tasks" value={blockedCount} sub="Requires intervention" icon={CircleAlert} tone="red"/></div>
    <div className="reports-grid"><div className="panel"><div className="panel-heading"><div><h2>Business unit completion</h2><p>Completion rate by source business unit</p></div><span className="panel-icon"><ChartNoAxesCombined size={18}/></span></div><div className="bar-chart">{entityStats.map(entity=><div className="bar-row" key={entity.id}><span title={entity.name}>{entity.name}</span><div className="bar-bg"><div className="bar-fill" style={{width:`${entity.pct}%`}}/></div><strong>{entity.pct}%</strong></div>)}</div></div>
      <div className="panel"><div className="panel-heading"><div><h2>Task status mix</h2><p>Current operational checklist instances</p></div><span className="panel-icon"><Activity size={18}/></span></div><div className="status-breakdown"><div className="donut-wrap"><div className="donut" style={{background:`conic-gradient(#1b9875 0 ${completedCount/Math.max(applicable.length,1)*100}%, #4b88d2 ${completedCount/Math.max(applicable.length,1)*100}% ${(completedCount+inProgressCount)/Math.max(applicable.length,1)*100}%, #d99a2b ${(completedCount+inProgressCount)/Math.max(applicable.length,1)*100}% ${(completedCount+inProgressCount+pendingCount)/Math.max(applicable.length,1)*100}%, #d75d5d ${(completedCount+inProgressCount+pendingCount)/Math.max(applicable.length,1)*100}% 100%)`}}><div className="donut-hole"><strong>{completion}%</strong><span>Complete</span></div></div></div><div className="legend">{[['Complete',completedCount,'green'],['In progress',inProgressCount,'blue'],['Not started',pendingCount,'amber'],['Blocked',blockedCount,'red']].map(([label,count,color])=><div className="legend-item" key={label}><span className={`legend-dot ${color}`}/><span>{label}</span><strong>{count}</strong></div>)}</div></div></div></div>
    <div className="panel attention-panel"><div className="panel-heading"><div><h2>Blocked activities</h2><p>Activities currently marked blocked</p></div><button className="text-btn" onClick={()=>setPage('checklist')}>View checklist <ArrowUpRight size={14}/></button></div><div className="attention-list">{applicable.filter(task=>task.status==='Blocked').slice(0,7).map(task=><button key={task.id} className="attention-item" onClick={()=>onOpenTask(task)}><span className="attention-alert red"><AlertTriangle size={16}/></span><span className="attention-copy"><strong>{task.title}</strong><small>{task.entity} · {task.owner}</small></span><StatusPill status={task.status}/><ChevronRight size={16}/></button>)}</div></div>
  </section>;
}
