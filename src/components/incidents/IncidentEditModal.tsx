import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { XIcon } from 'lucide-react';
import type { Incident } from '../api/models/entities';
import { incidentsService } from '../api/services/incidentsService';

interface IncidentEditModalProps {
  incident: Incident;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function IncidentEditModal({ incident, open, onClose, onSaved }: IncidentEditModalProps) {
  const [title, setTitle] = useState(incident.title);
  const [description, setDescription] = useState(incident.description || '');
  const [status, setStatus] = useState(incident.status);
  const [severity, setSeverity] = useState(incident.severity);
  const [location, setLocation] = useState(incident.location || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await incidentsService.updateIncident(incident.id, {
        title,
        description,
        status,
        severity,
        location
      });
      onSaved();
    } catch (err) {
      alert('Failed to update incident');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-charcoal">Edit Incident</h3>
            <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal">
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue focus:border-transparent"
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue focus:border-transparent"
                >
                  <option value="open">Open</option>
                  <option value="investigating">Investigating</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Severity</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as any)}
                  className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue focus:border-transparent"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue focus:border-transparent"
              />
            </div>

            <div className="flex gap-3 pt-4 border-t border-surface-200">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-surface-300 text-charcoal rounded-lg text-sm font-semibold hover:bg-surface-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}