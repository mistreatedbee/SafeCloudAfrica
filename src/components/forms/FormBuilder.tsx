import React, { useState, useCallback } from 'react';
import { PlusIcon, TrashIcon, GripVerticalIcon } from 'lucide-react';
import type { FormField } from '../../api/services/formsService';

interface FormBuilderProps {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
}

export function FormBuilder({ fields, onChange }: FormBuilderProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const addField = useCallback((type: FormField['type']) => {
    const newField: FormField = {
      id: `field-${Date.now()}`,
      type,
      label: `New ${type} field`,
      required: false,
      placeholder: ''
    };
    onChange([...fields, newField]);
  }, [fields, onChange]);

  const removeField = useCallback((id: string) => {
    onChange(fields.filter(f => f.id !== id));
  }, [fields, onChange]);

  const updateField = useCallback((id: string, updates: Partial<FormField>) => {
    onChange(fields.map(f => (f.id === id ? { ...f, ...updates } : f)));
  }, [fields, onChange]);

  const moveField = useCallback((fromIndex: number, toIndex: number) => {
    const newFields = [...fields];
    const [movedField] = newFields.splice(fromIndex, 1);
    newFields.splice(toIndex, 0, movedField);
    onChange(newFields);
  }, [fields, onChange]);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedId(`${index}`);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
    e.preventDefault();
    const sourceIndex = parseInt(draggedId || '-1', 10);
    if (sourceIndex !== -1 && sourceIndex !== targetIndex) {
      moveField(sourceIndex, targetIndex);
    }
    setDraggedId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => addField('text')}
          className="px-3 py-1 bg-blue-100 text-blue hover:bg-blue-200 rounded text-sm"
        >
          + Text
        </button>
        <button
          onClick={() => addField('textarea')}
          className="px-3 py-1 bg-blue-100 text-blue hover:bg-blue-200 rounded text-sm"
        >
          + Textarea
        </button>
        <button
          onClick={() => addField('select')}
          className="px-3 py-1 bg-blue-100 text-blue hover:bg-blue-200 rounded text-sm"
        >
          + Select
        </button>
        <button
          onClick={() => addField('checkbox')}
          className="px-3 py-1 bg-blue-100 text-blue hover:bg-blue-200 rounded text-sm"
        >
          + Checkbox
        </button>
        <button
          onClick={() => addField('radio')}
          className="px-3 py-1 bg-blue-100 text-blue hover:bg-blue-200 rounded text-sm"
        >
          + Radio
        </button>
        <button
          onClick={() => addField('date')}
          className="px-3 py-1 bg-blue-100 text-blue hover:bg-blue-200 rounded text-sm"
        >
          + Date
        </button>
        <button
          onClick={() => addField('file')}
          className="px-3 py-1 bg-blue-100 text-blue hover:bg-blue-200 rounded text-sm"
        >
          + File
        </button>
      </div>

      <div className="space-y-3">
        {fields.length === 0 ? (
          <p className="text-sm text-charcoal-400 py-8 text-center">
            No fields yet. Click a button above to add one.
          </p>
        ) : (
          fields.map((field, index) => (
            <div
              key={field.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
              className={`p-4 border border-surface-300 rounded-lg bg-white cursor-move transition-all ${
                draggedId === `${index}` ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="pt-2 text-charcoal-400">
                  <GripVerticalIcon className="w-5 h-5" />
                </div>

                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-charcoal mb-1">Label</label>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => updateField(field.id, { label: e.target.value })}
                        className="w-full px-2 py-1 border border-surface-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-charcoal mb-1">Type</label>
                      <select
                        value={field.type}
                        onChange={(e) => updateField(field.id, { type: e.target.value as FormField['type'] })}
                        className="w-full px-2 py-1 border border-surface-300 rounded text-sm"
                      >
                        <option value="text">Text</option>
                        <option value="textarea">Textarea</option>
                        <option value="select">Select</option>
                        <option value="checkbox">Checkbox</option>
                        <option value="radio">Radio</option>
                        <option value="date">Date</option>
                        <option value="file">File</option>
                      </select>
                    </div>
                  </div>

                  {field.type !== 'textarea' && (
                    <div>
                      <label className="block text-xs font-medium text-charcoal mb-1">Placeholder</label>
                      <input
                        type="text"
                        value={field.placeholder || ''}
                        onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                        className="w-full px-2 py-1 border border-surface-300 rounded text-sm"
                      />
                    </div>
                  )}

                  {(field.type === 'select' || field.type === 'radio') && (
                    <div>
                      <label className="block text-xs font-medium text-charcoal mb-1">
                        Options (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={field.options?.join(', ') || ''}
                        onChange={(e) =>
                          updateField(field.id, {
                            options: e.target.value.split(',').map(s => s.trim())
                          })
                        }
                        className="w-full px-2 py-1 border border-surface-300 rounded text-sm"
                        placeholder="Option 1, Option 2, Option 3"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`required-${field.id}`}
                      checked={field.required}
                      onChange={(e) => updateField(field.id, { required: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <label htmlFor={`required-${field.id}`} className="text-sm text-charcoal">
                      Required
                    </label>
                  </div>
                </div>

                <button
                  onClick={() => removeField(field.id)}
                  className="p-2 text-critical hover:bg-critical-50 rounded"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}