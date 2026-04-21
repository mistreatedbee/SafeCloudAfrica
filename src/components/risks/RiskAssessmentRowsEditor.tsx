import { Fragment } from 'react';
import type { RiskAssessmentType } from '../../api/services/riskAssessmentsService';
import { buildRiskTableLayout } from '../../utils/riskTableLayout';

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
const tableHeaderCell = 'px-3 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase align-top whitespace-normal min-w-[120px]';
const tableDataCell = 'px-3 py-3 align-top whitespace-normal';

type Props = {
  type: RiskAssessmentType;
  columns: RiskTableColumnDef[];
  rows: RiskDraftRow[];
  readOnly?: boolean;
  allowResidualEditing: boolean;
  onUpdateRow: (rowId: string, patch: Partial<RiskDraftRow>) => void;
  onAddRow?: () => void;
  onInsertRowAt: (index: number) => void;
  onDuplicateRowAt: (index: number) => void;
  onRemoveRow: (rowId: string) => void;
};

function JsonCellTable(props: {
  type: RiskAssessmentType;
  col: RiskTableColumnDef;
  row: RiskDraftRow;
  readOnly: boolean;
  onUpdateRow: (rowId: string, patch: Partial<RiskDraftRow>) => void;
}) {
  const { type, col, row, readOnly, onUpdateRow } = props;
  if (type === 'prework' && col.key === 'quick_rating') {
    return (
      <td className={tableDataCell}>
        <select
          disabled={readOnly}
          value={String(row.json_data.quick_rating ?? 'Medium')}
          onChange={(e) => onUpdateRow(row.localId, { json_data: { ...row.json_data, quick_rating: e.target.value } })}
          className={`${inputTable} w-full min-w-[160px]`}
        >
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
        </select>
      </td>
    );
  }

  return (
    <td className={tableDataCell}>
      <input
        disabled={readOnly}
        type={col.kind === 'date' ? 'date' : 'text'}
        value={String(row.json_data[col.key] ?? '')}
        onChange={(e) => onUpdateRow(row.localId, { json_data: { ...row.json_data, [col.key]: e.target.value } })}
        className={`${inputTable} w-full min-w-[160px]`}
      />
    </td>
  );
}

function JsonFieldCard(props: {
  type: RiskAssessmentType;
  col: RiskTableColumnDef;
  row: RiskDraftRow;
  readOnly: boolean;
  onUpdateRow: (rowId: string, patch: Partial<RiskDraftRow>) => void;
  rowKeyPrefix: string;
}) {
  const { type, col, row, readOnly, onUpdateRow, rowKeyPrefix } = props;
  const id = `${rowKeyPrefix}-${col.key}`;

  if (type === 'prework' && col.key === 'quick_rating') {
    return (
      <div>
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
    <div>
      <label htmlFor={id} className={labelCard}>
        {col.label}
      </label>
      <input
        id={id}
        disabled={readOnly}
        type={col.kind === 'date' ? 'date' : 'text'}
        value={String(row.json_data[col.key] ?? '')}
        onChange={(e) => onUpdateRow(row.localId, { json_data: { ...row.json_data, [col.key]: e.target.value } })}
        className={inputCard}
      />
    </div>
  );
}

function ResidualCellTable(props: {
  row: RiskDraftRow;
  readOnly: boolean;
  allowResidualEditing: boolean;
  onUpdateRow: (rowId: string, patch: Partial<RiskDraftRow>) => void;
}) {
  const { row, readOnly, allowResidualEditing, onUpdateRow } = props;
  if (allowResidualEditing) {
    return (
      <td className={tableDataCell}>
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
            aria-label="Residual severity"
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
            aria-label="Residual likelihood"
          />
          <span>{row.residual_rr ?? '-'}</span>
          <span>{row.residual_index ?? '-'}</span>
        </div>
      </td>
    );
  }

  return (
    <td className={tableDataCell}>
      <span className="text-sm">
        {`${row.residual_severity ?? '-'} / ${row.residual_likelihood ?? '-'} / ${row.residual_rr ?? '-'} / ${row.residual_index ?? '-'}`}
      </span>
    </td>
  );
}

function ResidualBlockCard(props: {
  row: RiskDraftRow;
  readOnly: boolean;
  allowResidualEditing: boolean;
  onUpdateRow: (rowId: string, patch: Partial<RiskDraftRow>) => void;
}) {
  const { row, readOnly, allowResidualEditing, onUpdateRow } = props;
  return (
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
  );
}

function RawScoringHeaders(props: { variant: 'compact' | 'separate' }) {
  if (props.variant === 'compact') {
    return (
      <>
        <th className={tableHeaderCell}>SL</th>
        <th className={tableHeaderCell}>RR</th>
        <th className={tableHeaderCell}>Index</th>
      </>
    );
  }
  return (
    <>
      <th className={tableHeaderCell}>S</th>
      <th className={tableHeaderCell}>L</th>
      <th className={tableHeaderCell}>S*L</th>
      <th className={tableHeaderCell}>Index</th>
    </>
  );
}

function RawScoringCellsTable(props: {
  row: RiskDraftRow;
  readOnly: boolean;
  variant: 'compact' | 'separate';
  onUpdateRow: (rowId: string, patch: Partial<RiskDraftRow>) => void;
}) {
  const { row, readOnly, variant, onUpdateRow } = props;
  if (variant === 'compact') {
    return (
      <>
        <td className={tableDataCell}>
          <div className="flex items-center gap-1">
            <input
              disabled={readOnly}
              type="number"
              min={1}
              max={5}
              value={row.severity ?? ''}
              onChange={(e) => onUpdateRow(row.localId, { severity: e.target.value ? Number(e.target.value) : null })}
              className="w-14 px-2 py-1 border border-surface-300 rounded text-sm"
              aria-label="Severity"
            />
            <input
              disabled={readOnly}
              type="number"
              min={1}
              max={5}
              value={row.likelihood ?? ''}
              onChange={(e) =>
                onUpdateRow(row.localId, { likelihood: e.target.value ? Number(e.target.value) : null })
              }
              className="w-14 px-2 py-1 border border-surface-300 rounded text-sm"
              aria-label="Likelihood"
            />
          </div>
        </td>
        <td className={`${tableDataCell} text-sm min-w-[96px]`}>{row.raw_rr ?? '-'}</td>
        <td className={`${tableDataCell} text-sm min-w-[96px]`}>{row.raw_index ?? '-'}</td>
      </>
    );
  }

  return (
    <>
      <td className={tableDataCell}>
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
      <td className={tableDataCell}>
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
      <td className={`${tableDataCell} text-sm min-w-[88px]`}>{row.raw_rr ?? '-'}</td>
      <td className={`${tableDataCell} text-sm min-w-[96px]`}>{row.raw_index ?? '-'}</td>
    </>
  );
}

function RawScoringBlockCard(props: {
  row: RiskDraftRow;
  readOnly: boolean;
  onUpdateRow: (rowId: string, patch: Partial<RiskDraftRow>) => void;
}) {
  const { row, readOnly, onUpdateRow } = props;
  return (
    <div className="space-y-2">
      <p className={labelCard}>Risk Rating</p>
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
  const rawVariant: 'compact' | 'separate' = type === 'task' ? 'compact' : 'separate';
  const layout = buildRiskTableLayout(type, columns);

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
        <table className="min-w-full w-max table-auto divide-y divide-surface-200">
          <thead className="bg-surface-50">
            <tr>
              <th className={`${tableHeaderCell} min-w-[64px]`}>#</th>
              {layout.map((item, idx) => {
                if (item.kind === 'data') {
                  return (
                    <th key={item.col.key} className={tableHeaderCell}>
                      {item.col.label}
                    </th>
                  );
                }
                if (item.kind === 'raw_scoring') {
                  return (
                    <Fragment key={`raw-${idx}`}>
                      <RawScoringHeaders variant={rawVariant} />
                    </Fragment>
                  );
                }
                if (item.kind === 'residual' && showResidualCol) {
                  return (
                    <th key={`residual-${idx}`} className={tableHeaderCell}>
                      Residual
                    </th>
                  );
                }
                return null;
              })}
              <th className={`${tableHeaderCell} min-w-[172px]`}>Row Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-200">
            {rows.map((row, idx) => (
              <tr key={row.localId}>
                <td className={`${tableDataCell} text-sm font-medium text-charcoal`}>{idx + 1}</td>
                {layout.map((item, itemIdx) => {
                  if (item.kind === 'data') {
                    return (
                      <JsonCellTable
                        key={`${row.localId}-${item.col.key}`}
                        type={type}
                        col={item.col as RiskTableColumnDef}
                        row={row}
                        readOnly={readOnly}
                        onUpdateRow={onUpdateRow}
                      />
                    );
                  }
                  if (item.kind === 'raw_scoring') {
                    return (
                      <Fragment key={`${row.localId}-raw-${itemIdx}`}>
                        <RawScoringCellsTable row={row} readOnly={readOnly} variant={rawVariant} onUpdateRow={onUpdateRow} />
                      </Fragment>
                    );
                  }
                  if (item.kind === 'residual' && showResidualCol) {
                    return (
                      <ResidualCellTable
                        key={`${row.localId}-residual-${itemIdx}`}
                        row={row}
                        readOnly={readOnly}
                        allowResidualEditing={allowResidualEditing}
                        onUpdateRow={onUpdateRow}
                      />
                    );
                  }
                  return null;
                })}
                <td className={tableDataCell}>
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
          <div key={row.localId} className="rounded-xl border border-surface-200 p-4 space-y-4 bg-surface-50/30 overflow-hidden">
            <p className="text-sm font-semibold text-charcoal">Row {idx + 1}</p>
            <div className="space-y-3">
              {layout.map((item, itemIdx) => {
                if (item.kind === 'data') {
                  return (
                    <JsonFieldCard
                      key={`${row.localId}-${item.col.key}`}
                      type={type}
                      col={item.col as RiskTableColumnDef}
                      row={row}
                      readOnly={readOnly}
                      onUpdateRow={onUpdateRow}
                      rowKeyPrefix={`ra-${row.localId}`}
                    />
                  );
                }
                if (item.kind === 'raw_scoring') {
                  return (
                    <div key={`${row.localId}-raw-${itemIdx}`}>
                      <RawScoringBlockCard row={row} readOnly={readOnly} onUpdateRow={onUpdateRow} />
                    </div>
                  );
                }
                if (item.kind === 'residual' && showResidualCol) {
                  return (
                    <ResidualBlockCard
                      key={`${row.localId}-residual-${itemIdx}`}
                      row={row}
                      readOnly={readOnly}
                      allowResidualEditing={allowResidualEditing}
                      onUpdateRow={onUpdateRow}
                    />
                  );
                }
                return null;
              })}
            </div>
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

