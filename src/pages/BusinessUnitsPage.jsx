import { Building2, CheckCircle2, ChevronRight, Clock3, Download } from 'lucide-react';
import Progress from '../components/Progress.jsx';

export default function BusinessUnitsPage({
  businessUnitsLoading, businessUnits, businessUnitCards, businessUnitLoadError,
  reload, openBusinessUnitEditor, selectedBusinessUnitId, setSelectedBusinessUnitId,
  exportCsv
}) {
  const updateSelected = () => {
    const selected = businessUnitCards.find(entity => entity.id === selectedBusinessUnitId);
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
  };

  return <section className="page-section">
    <div className="page-heading"><div><div className="eyebrow">BUSINESS UNIT OVERSIGHT</div><h1>Business units</h1><p>{businessUnitsLoading ? 'Loading mapping records…' : `${businessUnits.length} mapping records from XX_BU_LE_LEDGER_MAPPING.`}</p></div><div className="entity-page-actions"><button className="btn secondary add-bu-button" onClick={()=>openBusinessUnitEditor()}><CheckCircle2 size={16}/> Add business unit</button>{selectedBusinessUnitId && <button className="btn secondary" onClick={updateSelected}><CheckCircle2 size={16}/> Update mapping</button>}<button className="btn secondary" onClick={exportCsv}><Download size={16}/> Export overview</button></div></div>
    {businessUnitLoadError && <div className="form-error business-unit-load-error" role="alert"><span>{businessUnitLoadError}</span><button className="btn secondary compact" onClick={reload} disabled={businessUnitsLoading}>Retry</button></div>}
    {businessUnitsLoading && <div className="api-loading" role="status">Loading Business Units from XX_BU_LE_LEDGER_MAPPING…</div>}
    {!businessUnitsLoading && !businessUnitLoadError && businessUnitCards.length === 0 && <div className="empty-state">No Business Unit mapping records were found in XX_BU_LE_LEDGER_MAPPING.</div>}
    {!businessUnitsLoading && !businessUnitLoadError && <div className="entity-grid">{businessUnitCards.map(entity=>{
      const isSelected = selectedBusinessUnitId === entity.id;
      return <div key={entity.id} className="entity-card-wrap">
        <button className={`entity-card ${isSelected ? 'selected' : ''}`} aria-pressed={isSelected} onClick={()=>setSelectedBusinessUnitId(isSelected ? null : entity.id)}>
          <span className={`entity-selection-radio ${isSelected ? 'selected' : ''}`} aria-hidden="true"/>
          <div className="entity-card-top"><div className="entity-symbol"><Building2 size={19}/></div><ChevronRight size={16}/></div>
          <h3>{entity.name}</h3>
          <div className="entity-progress-label"><span>Close completion</span><strong>{entity.pct}%</strong></div><Progress value={entity.pct} color={entity.pct===100?'green':'blue'}/><div className="entity-card-bottom"><span><CheckCircle2 size={14}/>{entity.done} complete</span><span><Clock3 size={14}/>{entity.pending+entity.inProgress+entity.blocked} open</span></div>
        </button>
      </div>;
    })}</div>}
  </section>;
}
