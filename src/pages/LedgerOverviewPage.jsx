import {
  Activity, ArrowUpRight, CheckCircle2, Clock3, Download, Landmark, Plus, Save, X
} from 'lucide-react';
import { useState } from 'react';
import Progress from '../components/Progress.jsx';
import StatusPill from '../components/StatusPill.jsx';

const emptyLedgerRecord = {
  LEDGER_ID: '',
  LEDGER_NAME: '',
  BUSINESS_UNIT_ID: '',
  BUSINESS_UNIT_NAME: '',
  LEGAL_ENTITY_ID: '',
  LEGAL_ENTITY_NAME: '',
  CURRENCY_CODE: '',
  CUTOFF_DATE: '',
  DUE_DAYS: ''
};

export default function LedgerOverviewPage({
  loading, error, selectedLedger, selectedLedgerId, selectedPeriod, status,
  showAllLedgers, ledgers, overviewsLoading, overviewsError, onSelectLedger,
  completion, completedCount, openCount, inProgressCount, pendingCount,
  blockedCount, activityCount, cutoffDate, dueDays, cutoffDateMixed, dueDaysMixed,
  moduleCount, onRetry, onGoChecklist, exportCsv,
  onUpdateLedger, onCreateLedger
}) {
  const [dialog, setDialog] = useState('');
  const [ledgerId, setLedgerId] = useState(selectedLedgerId);
  const [ledgerName, setLedgerName] = useState(selectedLedger);
  const [editingLedgerId, setEditingLedgerId] = useState(selectedLedgerId);
  const [ledgerCutoffDate, setLedgerCutoffDate] = useState(cutoffDate);
  const [ledgerDueDays, setLedgerDueDays] = useState(dueDays);
  const [editingCutoffDateMixed, setEditingCutoffDateMixed] = useState(cutoffDateMixed);
  const [editingDueDaysMixed, setEditingDueDaysMixed] = useState(dueDaysMixed);
  const [newLedger, setNewLedger] = useState(emptyLedgerRecord);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  const openUpdateDialog = (ledger = null) => {
    setEditingLedgerId(ledger?.ledgerId || selectedLedgerId);
    setLedgerId(ledger?.ledgerId || selectedLedgerId);
    setLedgerName(ledger?.ledgerName || selectedLedger);
    setLedgerCutoffDate(ledger?.cutoffDate ?? cutoffDate);
    setLedgerDueDays(ledger?.dueDays ?? dueDays);
    setEditingCutoffDateMixed(ledger?.cutoffDateMixed ?? cutoffDateMixed);
    setEditingDueDaysMixed(ledger?.dueDaysMixed ?? dueDaysMixed);
    setActionError('');
    setDialog('update');
  };

  const openCreateDialog = () => {
    setNewLedger(emptyLedgerRecord);
    setActionError('');
    setDialog('create');
  };

  const updateNewLedger = (field, value) => {
    setNewLedger(current => ({ ...current, [field]: value }));
  };

  const submitUpdate = async event => {
    event.preventDefault();
    setSaving(true);
    setActionError('');
    try {
      await onUpdateLedger({
        oldLedgerId: editingLedgerId,
        ledgerId: ledgerId.trim(),
        ledgerName: ledgerName.trim(),
        cutoffDate: ledgerCutoffDate,
        dueDays: ledgerDueDays
      });
      setDialog('');
    } catch (saveError) {
      setActionError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const submitCreate = async event => {
    event.preventDefault();
    setSaving(true);
    setActionError('');
    try {
      await onCreateLedger(newLedger);
      setDialog('');
    } catch (saveError) {
      setActionError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return <section className="page-section">
    <div className="page-heading">
      <div>
        <div className="eyebrow">LEDGER OVERSIGHT</div>
        <h1>Ledger overview</h1>
        <p>{showAllLedgers
          ? `${ledgers.length} Ledgers · ${selectedPeriod} · Close progress and mapping details`
          : selectedLedger
            ? `${selectedLedger} · ${selectedPeriod} · Ledger close progress and activities`
            : 'Select a ledger to view its close overview.'}</p>
      </div>
      <div className="ledger-overview-actions">
        {!showAllLedgers&&<button className="btn secondary" onClick={()=>openUpdateDialog()} disabled={!selectedLedgerId || loading}>
          <Save size={16}/> Update Ledger (Ledger-wide)
        </button>}
        <button className="btn secondary" onClick={openCreateDialog} disabled={loading}>
          <Plus size={16}/> Add new record
        </button>
        {!showAllLedgers&&<button className="btn secondary" onClick={exportCsv} disabled={!activityCount}>
          <Download size={16}/> Export ledger activities
        </button>}
        {!showAllLedgers&&<button className="btn primary" onClick={onGoChecklist}>
          View checklist <ArrowUpRight size={16}/>
        </button>}
      </div>
    </div>
    {error && <div className="form-error business-unit-load-error" role="alert">
      <span>{error}</span>
      <button className="btn secondary compact" onClick={onRetry} disabled={loading}>Retry</button>
    </div>}
    {showAllLedgers && overviewsLoading && <div className="api-loading" role="status">Loading all Ledger details…</div>}
    {showAllLedgers && overviewsError && <div className="form-error business-unit-load-error" role="alert">
      <span>{overviewsError}</span>
      <button className="btn secondary compact" onClick={onRetry} disabled={overviewsLoading}>Retry</button>
    </div>}
    {showAllLedgers && !overviewsLoading && !overviewsError && ledgers.length===0 && <div className="empty-state">No Ledger mapping records were found.</div>}
    {showAllLedgers && !overviewsLoading && !overviewsError && ledgers.length>0 && <div className="all-ledger-grid">{ledgers.map(ledger=><article className="all-ledger-card" key={ledger.ledgerId}>
      <div className="all-ledger-card-head">
        <div className="ledger-overview-symbol"><Landmark size={19}/></div>
        <div className="ledger-overview-name"><span>LEDGER</span><h2>{ledger.ledgerName}</h2><small>ID: {ledger.ledgerId}</small></div>
        <StatusPill status={ledger.status}/>
      </div>
      <div className="all-ledger-card-progress">
        <div className="ledger-overview-progress-label"><span>Close completion</span><strong>{ledger.completion}%</strong></div>
        <Progress value={ledger.completion} color={ledger.completion===100?'green':'blue'}/>
      </div>
      <div className="all-ledger-card-stats">
        <span><strong>{ledger.activityCount}</strong> activities</span>
        <span><strong>{ledger.completedCount}</strong> complete</span>
        <span><strong>{ledger.openCount}</strong> open</span>
      </div>
      <div className="all-ledger-card-meta">
        <span>{ledger.mappingCount} BU mappings</span>
        <span>Cutoff: {ledger.cutoffDateMixed?'Multiple':ledger.cutoffDate||'—'}</span>
        <span>Due days: {ledger.dueDaysMixed?'Multiple':ledger.dueDays||'—'}</span>
      </div>
      <div className="all-ledger-card-actions">
        <button className="btn secondary" onClick={()=>openUpdateDialog(ledger)}><Save size={14}/> Update</button>
        <button className="btn primary" onClick={()=>onSelectLedger(ledger.ledgerId)}>Open Ledger</button>
      </div>
    </article>)}</div>}
    {!showAllLedgers&&loading && <div className="api-loading" role="status">Loading selected ledger activity…</div>}
    {!showAllLedgers&&!loading&&!error&&!selectedLedgerId&&<div className="empty-state">No ledger is selected. Choose a ledger or select All ledgers.</div>}
    {!showAllLedgers&&!loading&&!error&&selectedLedgerId&&<div className="ledger-overview-card">
      <div className="ledger-overview-card-head">
        <div className="ledger-overview-symbol"><Landmark size={21}/></div>
        <div className="ledger-overview-name">
          <span>SELECTED LEDGER</span>
          <h2>{selectedLedger}</h2>
          <small>Ledger ID: {selectedLedgerId}</small>
        </div>
        <StatusPill status={status}/>
      </div>
      <div className="ledger-overview-progress">
        <div className="ledger-overview-progress-label">
          <span>Close completion</span>
          <strong>{completion}%</strong>
        </div>
        <div className="ledger-overview-selected-meta">
          <span><strong>Cutoff date</strong>{cutoffDateMixed?'Multiple mapped values':cutoffDate||'Not set'}</span>
          <span><strong>Due days</strong>{dueDaysMixed?'Multiple mapped values':dueDays||'Not set'}</span>
        </div>
        <Progress value={completion} color={completion===100?'green':'blue'}/>
      </div>
      <div className="ledger-overview-metrics">
        <div><CheckCircle2 size={16}/><span>Complete</span><strong>{completedCount}</strong></div>
        <div><Clock3 size={16}/><span>Open activities</span><strong>{openCount}</strong></div>
        <div><Activity size={16}/><span>In progress</span><strong>{inProgressCount}</strong></div>
        <div><span className="summary-dot amber"/><span>Not started</span><strong>{pendingCount}</strong></div>
        <div><span className="summary-dot red"/><span>Blocked</span><strong>{blockedCount}</strong></div>
      </div>
      <div className="ledger-overview-footer">
        <span><strong>{activityCount}</strong> ledger activities</span>
        <span><strong>{moduleCount}</strong> checklist modules</span>
        <button className="text-btn" onClick={onGoChecklist}>Open activities <ArrowUpRight size={14}/></button>
      </div>
    </div>}
    {dialog && <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!saving)setDialog('');}}>
      <form className="detail-drawer ledger-action-drawer" onSubmit={dialog==='update'?submitUpdate:submitCreate}>
        <div className="drawer-head">
          <div><div className="eyebrow">LEDGER MANAGEMENT</div><h2>{dialog==='update'?'Update Ledger':'Add new Ledger record'}</h2></div>
          <button className="icon-btn" type="button" aria-label="Close" onClick={()=>setDialog('')} disabled={saving}><X size={19}/></button>
        </div>
        <div className="drawer-body">
          {actionError && <p className="form-error" role="alert">{actionError}</p>}
          {dialog==='update' ? <>
            <p className="ledger-action-help">This updates the Ledger ID and name across its mapped business units, checklist activities, and saved progress.</p>
            <label className="field-label" htmlFor="edit-ledger-id">Ledger ID</label>
            <input id="edit-ledger-id" className="field-control" inputMode="numeric" pattern="[0-9]+" required value={ledgerId} onChange={event=>setLedgerId(event.target.value)}/>
            <label className="field-label" htmlFor="edit-ledger-name">Ledger name</label>
            <input id="edit-ledger-name" className="field-control" maxLength="255" required value={ledgerName} onChange={event=>setLedgerName(event.target.value)}/>
            <label className="field-label" htmlFor="edit-ledger-cutoff">Cutoff date (shared across mapped Business Units)</label>
            <input id="edit-ledger-cutoff" className="field-control" type="date" required={editingCutoffDateMixed} value={ledgerCutoffDate} onChange={event=>setLedgerCutoffDate(event.target.value)}/>
            {editingCutoffDateMixed&&<p className="ledger-action-help">Mapped Business Units currently have different cutoff dates. Enter one shared date to continue.</p>}
            <label className="field-label" htmlFor="edit-ledger-due-days">Due days (shared across mapped Business Units)</label>
            <input id="edit-ledger-due-days" className="field-control" type="number" min="0" step="1" required={editingDueDaysMixed} value={ledgerDueDays} onChange={event=>setLedgerDueDays(event.target.value)}/>
            {editingDueDaysMixed&&<p className="ledger-action-help">Mapped Business Units currently have different due days. Enter one shared value to continue.</p>}
          </> : <>
            <p className="ledger-action-help">Create a new Ledger together with its first Business Unit and Legal Entity mapping.</p>
            <div className="field-grid">
              <div><label className="field-label" htmlFor="new-ledger-id">Ledger ID</label><input id="new-ledger-id" className="field-control" inputMode="numeric" pattern="[0-9]+" required value={newLedger.LEDGER_ID} onChange={event=>updateNewLedger('LEDGER_ID', event.target.value)}/></div>
              <div><label className="field-label" htmlFor="new-ledger-name">Ledger name</label><input id="new-ledger-name" className="field-control" maxLength="255" required value={newLedger.LEDGER_NAME} onChange={event=>updateNewLedger('LEDGER_NAME', event.target.value)}/></div>
              <div><label className="field-label" htmlFor="new-bu-id">Business Unit ID</label><input id="new-bu-id" className="field-control" inputMode="numeric" required value={newLedger.BUSINESS_UNIT_ID} onChange={event=>updateNewLedger('BUSINESS_UNIT_ID', event.target.value)}/></div>
              <div><label className="field-label" htmlFor="new-bu-name">Business Unit name</label><input id="new-bu-name" className="field-control" required value={newLedger.BUSINESS_UNIT_NAME} onChange={event=>updateNewLedger('BUSINESS_UNIT_NAME', event.target.value)}/></div>
              <div><label className="field-label" htmlFor="new-le-id">Legal Entity ID</label><input id="new-le-id" className="field-control" required value={newLedger.LEGAL_ENTITY_ID} onChange={event=>updateNewLedger('LEGAL_ENTITY_ID', event.target.value)}/></div>
              <div><label className="field-label" htmlFor="new-le-name">Legal Entity name</label><input id="new-le-name" className="field-control" required value={newLedger.LEGAL_ENTITY_NAME} onChange={event=>updateNewLedger('LEGAL_ENTITY_NAME', event.target.value)}/></div>
              <div><label className="field-label" htmlFor="new-ledger-currency">Currency code</label><input id="new-ledger-currency" className="field-control" value={newLedger.CURRENCY_CODE} onChange={event=>updateNewLedger('CURRENCY_CODE', event.target.value)}/></div>
              <div><label className="field-label" htmlFor="new-ledger-cutoff">Cutoff date</label><input id="new-ledger-cutoff" className="field-control" type="date" value={newLedger.CUTOFF_DATE} onChange={event=>updateNewLedger('CUTOFF_DATE', event.target.value)}/></div>
              <div><label className="field-label" htmlFor="new-ledger-due-days">Due days</label><input id="new-ledger-due-days" className="field-control" type="number" min="0" value={newLedger.DUE_DAYS} onChange={event=>updateNewLedger('DUE_DAYS', event.target.value)}/></div>
            </div>
          </>}
        </div>
        <div className="drawer-footer">
          <button className="btn secondary" type="button" onClick={()=>setDialog('')} disabled={saving}>Cancel</button>
          <button className="btn primary" type="submit" disabled={saving}>
            {saving?'Saving…':dialog==='update'?'Update Ledger':'Create Ledger'}
          </button>
        </div>
      </form>
    </div>}
  </section>;
}
