import type { RiskAssessmentType } from '../../api/services/riskAssessmentsService';

/** Mirrors `RiskTableColumn` in pages/risks/riskTemplates (kept here to avoid components importing pages). */
export type RiskTableColumnDef = { key: string; label: string; kind?: 'text' | 'date' };

export type RiskDraftRow = {
  localId: string;
  json_data: Record<string, unknown>;
  severity: number | null;
  likelihood: number | null;
  residual_severity: number | null;
  residual_likelihood: number | null;
  raw_rr: number | null;
  raw_index: 'Low' | 'Medium' | 'High' | null;
  residual_rr: number | null;
  residual_index: 'Low' | 'Medium' | 'High' | null;
  responsible_person: string | null;
  target_date: string | null;
  completion_date: string | null;
};

const inputTable = 'px-2 py-1 border border-surface-300 rounded text-sm';
const inputCard = 'w-full min-h-[44px] px-3 py-2 border border-surface-300 rounded-lg text-sm bg-white';
const labelCard = 'text-xs font-medium text-charcoal-500 mb-1';

type Props = {
  type: RiskAssessmentType;
  columns: RiskTableColumnDef[];
  rows: RiskDraftRow[];
  readOnly?: boolean;
  /** Create page uses inputs; edit page shows residual as read-only text in the table. */
  allowResidualEditing: boolean;
  onUpdateRow: (rowId: string, patch: Partial<RiskDraftRow>) => void;
  onAddRow?: () => void;
  onInsertRowAt: (index: number) => void;
  onDuplicateRowAt: (index: number) => void;
  onRemoveRow: (rowId: string) => void;
};

function ColumnCellsTable(props: {
  type: RiskAssessmentType;
  columns: RiskTableColumnDef[];
  row: RiskDraftRow;
  readOnly: boolean;
  onUpdateRow: (rowId: string, patch: Partial<RiskDraftRow>) => void;
}) {
  const { type, columns, row, readOnly, onUpdateRow } = props;
  return (
    <>
      {columns.map((col) => {
        if (type === 'prework' && col.key === 'quick_rating') {
          return (
            <td key={col.key} className="px-3 py-2">
              <select
                disabled={readOnly}
                value={String(row.json_data.quick_rating ?? 'Medium')}
                onChange={(e) => onUpdateRow(row.localId, { json_data: { ...row.json_data, quick_rating: e.target.value } })}
                className={inputTable}
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </td>
          );
        }
        return (
          <td key={col.key} className="px-3 py-2">
            <input
              disabled={readOnly}
              type={col.kind === 'date' ? 'date' : 'text'}
              value={String(row.json_data[col.key] ?? '')}
              onChange={(e) =>
                onUpdateRow(row.localId, { json_data: { ...row.json_data, [col.key]: e.target.value } })
              }
              className={`${inputTable} md:min-w-[180px]`}
            />
          </td>
        );
      })}
    </>
  );
}

function ColumnFieldsCard(props: {
  type: RiskAssessmentType;
  columns: RiskTableColumnDef[];
  row: RiskDraftRow;
  readOnly: boolean;
  onUpdateRow: (rowId: string, patch: Partial<RiskDraftRow>) => void;
  rowKeyPrefix: string;
}) {
  const { type, columns, row, readOnly, onUpdateRow, rowKeyPrefix } = props;
  return (
    <div className="space-y-3">
      {columns.map((col) => {
        const id = `${rowKeyPrefix}-${col.key}`;
        if (type === 'prework' && col.key === 'quick_rating') {
          return (
            <div key={col.key}>
              <label htmlFor={id} className={labelCard}>
                {col.label}
              </label>
              <select
                id={id}
                disabled={readOnly}
                value={String(row.json_data.quick_rating ?? 'Medium')}
                onChange={(e) => onUpdateRow(row.localId, { json_data: { ...row.json_data, quick_rating: e.target.value } })}
                className={inputCard}
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </div>
          );
        }
        return (
          <div key={col.key}>
            <label htmlFor={id} className={labelCard}>
              {col.label}
            </label>
            <input
              id={id}
              disabled={readOnly}
              type={col.kind === 'date' ? 'date' : 'text'}
              value={String(row.json_data[col.key] ?? '')}
              onChange={(e) =>
                onUpdateRow(row.localId, { json_data: { ...row.json_data, [col.key]: e.target.value } })
              }
              className={inputCard}
            />
          </div>
        );
      })}
    </div>
  );
}

export function RiskAssessmentRowsEditor(props: Props) {
  const {
    type,
    columns,
    rows,
    readOnly = false,
    allowResidualEditing,
    onUpdateRow,
    onAddRow,
    onInsertRowAt,
    onDuplicateRowAt,
    onRemoveRow
  } = props;

  const showResidualCol = type !== 'critical' && type !== 'prework';

  return (
    <div className="bg-white border border-surface-300 rounded-xl shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-200 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-semibold text-charcoal">Assessment Table</p>
        {onAddRow && !readOnly && (
          <button
            type="button"
            onClick={onAddRow}
            className="min-h-[44px] inline-flex items-center justify-center px-3 rounded-lg border border-teal text-teal text-xs font-semibold w-full sm:w-auto"
          >
            Add Row
          </button>
        )}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-surface-200">
          <thead className="bg-surface-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">#</th>
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">
                  {col.label}
                </th>
              ))}
              <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">S</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">L</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">S*L</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Index</th>
              {showResidualCol && (
                <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">
                  Residual S/L/S*L/Index
                </th>
              )}
              <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Row Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-200">
            {rows.map((row, idx) => (
              <tr key={row.localId}>
                <td className="px-3 py-2 text-sm">{idx + 1}</td>
                <ColumnCellsTable
                  type={type}
                  columns={columns}
                  row={row}
                  readOnly={readOnly}
                  onUpdateRow={onUpdateRow}
                />
                <td className="px-3 py-2">
                  <input
                    disabled={readOnly}
                    type="number"
                    min={1}
                    max={5}
                    value={row.severity ?? ''}
                    onChange={(e) => onUpdateRow(row.localId, { severity: e.target.value ? Number(e.target.value) : null })}
                    className="w-14 px-2 py-1 border border-surface-300 rounded text-sm"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    disabled={readOnly}
                    type="number"
                    min={1}
                    max={5}
                    value={row.likelihood ?? ''}
                    onChange={(e) => onUpdateRow(row.localId, { likelihood: e.target.value ? Number(e.target.value) : null })}
                    className="w-14 px-2 py-1 border border-surface-300 rounded text-sm"
                  />
                </td>
                <td className="px-3 py-2 text-sm">{row.raw_rr ?? '-'}</td>
                <td className="px-3 py-2 text-sm">{row.raw_index ?? '-'}</td>
                {showResidualCol && (
                  <td className="px-3 py-2">
                    {allowResidualEditing ? (
                      <div className="flex items-center gap-1 text-sm flex-wrap">
                        <input
                          disabled={readOnly}
                          type="number"
                          min={1}
                          max={5}
                          value={row.residual_severity ?? ''}
                          onChange={(e) =>
                            onUpdateRow(row.localId, { residual_severity: e.target.value ? Number(e.target.value) : null })
                          }
                          className="w-12 px-1 py-1 border border-surface-300 rounded"
                        />
                        <input
                          disabled={readOnly}
                          type="number"
                          min={1}
                          max={5}
                          value={row.residual_likelihood ?? ''}
                          onChange={(e) =>
                            onUpdateRow(row.localId, { residual_likelihood: e.target.value ? Number(e.target.value) : null })
                          }
                          className="w-12 px-1 py-1 border border-surface-300 rounded"
                        />
                        <span>{row.residual_rr ?? '-'}</span>
                        <span>{row.residual_index ?? '-'}</span>
                      </div>
                    ) : (
                      <span className="text-sm">
                        {`${row.residual_severity ?? '-'} / ${row.residual_likelihood ?? '-'} / ${row.residual_rr ?? '-'} / ${row.residual_index ?? '-'}`}
                      </span>
                    )}
                  </td>
                )}
                <td className="px-3 py-2">
                  {!readOnly && (
                    <div className="flex flex-col items-start gap-1 text-xs">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => onInsertRowAt(idx)}
                          className="px-1.5 py-0.5 rounded border border-surface-300 text-charcoal-700 hover:bg-surface-50"
                        >
                          Insert Above
                        </button>
                        <button
                          type="button"
                          onClick={() => onInsertRowAt(idx + 1)}
                          className="px-1.5 py-0.5 rounded border border-surface-300 text-charcoal-700 hover:bg-surface-50"
                        >
                          Insert Below
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateRowAt(idx)}
                          className="px-1.5 py-0.5 rounded border border-surface-300 text-charcoal-700 hover:bg-surface-50"
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveRow(row.localId)}
                          className="px-1.5 py-0.5 rounded border border-critical/40 text-critical hover:bg-critical/5"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden p-4 space-y-4">
        {rows.map((row, idx) => (
          <div key={row.localId} className="rounded-xl border border-surface-200 p-4 space-y-4 bg-surface-50/30">
            <p className="text-sm font-semibold text-charcoal">Row {idx + 1}</p>
            <ColumnFieldsCard
              type={type}
              columns={columns}
              row={row}
              readOnly={readOnly}
              onUpdateRow={onUpdateRow}
              rowKeyPrefix={`ra-${row.localId}`}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCard} htmlFor={`ra-${row.localId}-s`}>
                  S (severity)
                </label>
                <input
                  id={`ra-${row.localId}-s`}
                  disabled={readOnly}
                  type="number"
                  min={1}
                  max={5}
                  value={row.severity ?? ''}
                  onChange={(e) => onUpdateRow(row.localId, { severity: e.target.value ? Number(e.target.value) : null })}
                  className={inputCard}
                />
              </div>
              <div>
                <label className={labelCard} htmlFor={`ra-${row.localId}-l`}>
                  L (likelihood)
                </label>
                <input
                  id={`ra-${row.localId}-l`}
                  disabled={readOnly}
                  type="number"
                  min={1}
                  max={5}
                  value={row.likelihood ?? ''}
                  onChange={(e) => onUpdateRow(row.localId, { likelihood: e.target.value ? Number(e.target.value) : null })}
                  className={inputCard}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-charcoal-600">
              <div>
                <span className="text-xs text-charcoal-500">S×L</span>
                <p className="font-medium text-charcoal">{row.raw_rr ?? '-'}</p>
              </div>
              <div>
                <span className="text-xs text-charcoal-500">Index</span>
                <p className="font-medium text-charcoal">{row.raw_index ?? '-'}</p>
              </div>
            </div>
            {showResidualCol && (
              <div>
                <p className={labelCard}>Residual (S / L / S×L / Index)</p>
                {allowResidualEditing && !readOnly ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-charcoal-500" htmlFor={`ra-${row.localId}-rs`}>
                        Res. S
                      </label>
                      <input
                        id={`ra-${row.localId}-rs`}
                        type="number"
                        min={1}
                        max={5}
                        value={row.residual_severity ?? ''}
                        onChange={(e) =>
                          onUpdateRow(row.localId, { residual_severity: e.target.value ? Number(e.target.value) : null })
                        }
                        className={inputCard}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-charcoal-500" htmlFor={`ra-${row.localId}-rl`}>
                        Res. L
                      </label>
                      <input
                        id={`ra-${row.localId}-rl`}
                        type="number"
                        min={1}
                        max={5}
                        value={row.residual_likelihood ?? ''}
                        onChange={(e) =>
                          onUpdateRow(row.localId, { residual_likelihood: e.target.value ? Number(e.target.value) : null })
                        }
                        className={inputCard}
                      />
                    </div>
                    <div className="col-span-2 text-sm">
                      {row.residual_rr ?? '-'} / {row.residual_index ?? '-'}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-charcoal">
                    {`${row.residual_severity ?? '-'} / ${row.residual_likelihood ?? '-'} / ${row.residual_rr ?? '-'} / ${row.residual_index ?? '-'}`}
                  </p>
                )}
              </div>
            )}
            {!readOnly && (
              <div className="flex flex-col gap-2 pt-2 border-t border-surface-200">
                <button
                  type="button"
                  onClick={() => onInsertRowAt(idx)}
                  className="min-h-[44px] rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
                >
                  Insert above
                </button>
                <button
                  type="button"
                  onClick={() => onInsertRowAt(idx + 1)}
                  className="min-h-[44px] rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
                >
                  Insert below
                </button>
                <button
                  type="button"
                  onClick={() => onDuplicateRowAt(idx)}
                  className="min-h-[44px] rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
                >
                  Duplicate row
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveRow(row.localId)}
                  className="min-h-[44px] rounded-lg border border-critical/40 text-sm font-medium text-critical hover:bg-critical/5"
                >
                  Delete row
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
