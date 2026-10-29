import {
  CheckCircle2, Circle, ChevronRight, Download, Search
} from 'lucide-react';
import StatusPill from '../components/StatusPill.jsx';

export default function ChecklistPage({
  completedCount, inProgressCount, pendingCount, blockedCount, exportCsv,
  selectedPeriod,
  search, setSearch,
  statusFilter, setStatusFilter, moduleFilter, setModuleFilter, modules,
  visibleTasks, applicable, onOpenTask
}) {
  return <section className="page-section">
    <div className="page-heading"><div><div className="eyebrow">CLOSE EXECUTION · {selectedPeriod}</div><h1>Operational checklist</h1><p>Ledger-level checklist activities for the selected ledger, counted once regardless of mapped business units.</p></div><button className="btn secondary" onClick={exportCsv}><Download size={16}/> Export</button></div>
    <div className="inline-summary"><div><span className="summary-dot green"/><strong>{completedCount}</strong><span>Complete</span></div><div><span className="summary-dot blue"/><strong>{inProgressCount}</strong><span>In progress</span></div><div><span className="summary-dot amber"/><strong>{pendingCount}</strong><span>Not started</span></div><div><span className="summary-dot red"/><strong>{blockedCount}</strong><span>Blocked</span></div></div>
    <div className="table-card">
      <div className="table-toolbar"><div className="search-box"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search activities, owners, ledger..."/></div><div className="toolbar-filters"><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option>All statuses</option><option>Not started</option><option>In progress</option><option>Blocked</option><option>Complete</option></select><select value={moduleFilter} onChange={e=>setModuleFilter(e.target.value)}><option>All modules</option>{modules.map(m=><option key={m}>{m}</option>)}</select></div></div>
      <div className="table-scroll"><table><thead><tr><th>Activity</th><th>Ledger</th><th>Process owner</th><th>Action / process type</th><th>Status</th><th></th></tr></thead><tbody>
        {visibleTasks.map(t=><tr key={t.id} onClick={()=>onOpenTask(t)} className="clickable-row"><td><div className="task-name">{t.status==='Complete'?<CheckCircle2 size={16} className="task-check done"/>:<Circle size={16} className="task-check"/>}<div><strong>{t.title}</strong><small>{t.module}</small></div></div></td><td><span className="entity-code">{t.ledgerName || t.ledgerId}</span></td><td><span className="owner-name"><span className="mini-avatar">{t.owner.split(' ').map(s=>s[0]).join('').slice(0,2)}</span>{t.owner}</span></td><td>{t.actionType || t.processType || '—'}</td><td><StatusPill status={t.status}/></td><td><button className="row-more" onClick={e=>{e.stopPropagation();onOpenTask(t)}}><ChevronRight size={17}/></button></td></tr>)}
        {visibleTasks.length===0&&<tr><td colSpan="6" className="empty-state">No activities match your filters.</td></tr>}
      </tbody></table></div>
      <div className="table-footer"><span>Showing <strong>{visibleTasks.length}</strong> of {applicable.length} ledger activities</span><span>Source checklist rows: <strong>{applicable.length}</strong></span></div>
    </div>
  </section>;
}
