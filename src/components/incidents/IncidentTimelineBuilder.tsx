import React, { useState } from 'react';
import { PlusIcon, XIcon, ClockIcon } from 'lucide-react';

export type TimelineEvent = {
  timestamp: string;
  notes: string;
};

export type IncidentTimelineBuilderProps = {
  events: TimelineEvent[];
  onChange: (events: TimelineEvent[]) => void;
  disabled?: boolean;
};

export function IncidentTimelineBuilder({
  events,
  onChange,
  disabled = false
}: IncidentTimelineBuilderProps) {
  function handleAddEvent() {
    if (disabled) return;
    const now = new Date();
    const newEvent: TimelineEvent = {
      timestamp: now.toISOString().slice(0, 16), // YYYY-MM-DDTHH:mm
      notes: ''
    };
    onChange([...events, newEvent]);
  }

  function handleUpdateEvent(index: number, field: keyof TimelineEvent, value: string) {
    if (disabled) return;
    const updated = [...events];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  }

  function handleRemoveEvent(index: number) {
    if (disabled) return;
    onChange(events.filter((_, i) => i !== index));
  }

  function handleMoveEvent(index: number, direction: 'up' | 'down') {
    if (disabled) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= events.length) return;
    
    const updated = [...events];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onChange(updated);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-charcoal">Incident Event Timeline</label>
        <button
          type="button"
          onClick={handleAddEvent}
          disabled={disabled}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-teal hover:bg-teal/5 rounded-lg disabled:opacity-60"
        >
          <PlusIcon className="w-4 h-4" />
          Add Event
        </button>
      </div>

      {events.length === 0 ? (
        <div className="text-sm text-charcoal-500 text-center py-4 border border-dashed border-surface-300 rounded-lg">
          No events added. Click "Add Event" to start building the timeline.
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event, index) => (
            <div key={index} className="flex gap-3 p-3 bg-surface-50 rounded-lg border border-surface-200">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <ClockIcon className="w-4 h-4 text-charcoal-400" />
                  <input
                    type="datetime-local"
                    value={event.timestamp}
                    onChange={(e) => handleUpdateEvent(index, 'timestamp', e.target.value)}
                    disabled={disabled}
                    className="flex-1 px-3 py-1.5 text-sm border border-surface-300 rounded focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                  />
                </div>
                <textarea
                  value={event.notes}
                  onChange={(e) => handleUpdateEvent(index, 'notes', e.target.value)}
                  placeholder="Event description..."
                  disabled={disabled}
                  rows={2}
                  className="w-full px-3 py-1.5 text-sm border border-surface-300 rounded focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                />
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => handleMoveEvent(index, 'up')}
                  disabled={disabled || index === 0}
                  className="px-2 py-1 text-xs text-charcoal-500 hover:text-charcoal disabled:opacity-30"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveEvent(index, 'down')}
                  disabled={disabled || index === events.length - 1}
                  className="px-2 py-1 text-xs text-charcoal-500 hover:text-charcoal disabled:opacity-30"
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveEvent(index)}
                  disabled={disabled}
                  className="px-2 py-1 text-xs text-critical hover:text-critical-600 disabled:opacity-60"
                  title="Remove"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
