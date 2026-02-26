/**
 * ConfigPanel Component
 * Dynamic table for defining de-identification rules with template support,
 * System/Custom badges, save/import config management, and reset.
 */

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, HelpCircle, Save, Upload, RefreshCw, ChevronDown, X, Check, Loader2 } from 'lucide-react';
import {
  getSystemTemplates,
  getSystemTemplate,
  saveUserConfig,
  listUserConfigs,
  getUserConfig,
} from '../services/api';

const STRATEGIES = [
  { value: 'Fake Data',    label: 'Fake Data',    description: 'Replace with realistic fake data (names, emails, dates, etc.)' },
  { value: 'Black Out',    label: 'Black Out',    description: 'Completely redact with a black rectangle' },
  { value: 'Entity Label', label: 'Entity Label', description: 'Replace with generic labels like Person_A, Email_1' },
];

const DEFAULT_FIELD = {
  id: '',
  name: '',
  description: '',
  strategy: 'Fake Data',
  source: 'custom',
};

const ConfigPanel = ({ onFieldsChange, initialFields = [] }) => {
  const [fields, setFields] = useState(
    initialFields.length > 0
      ? initialFields.map((f, i) => ({ ...DEFAULT_FIELD, ...f, id: `field-${i}` }))
      : [{ ...DEFAULT_FIELD, id: 'field-0' }]
  );
  const [systemTemplates, setSystemTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');

  // Save modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [configName, setConfigName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTab, setImportTab] = useState('saved');
  const [savedConfigs, setSavedConfigs] = useState([]);
  const [isLoadingConfigs, setIsLoadingConfigs] = useState(false);
  const [importError, setImportError] = useState('');

  const fileInputRef = useRef(null);

  // ── Load system templates on mount ─────────────────────────────────────────
  useEffect(() => {
    getSystemTemplates()
      .then((res) => setSystemTemplates(res.templates || []))
      .catch((err) => console.error('Failed to load system templates:', err));
  }, []);

  // ── Template selection ──────────────────────────────────────────────────────
  const handleTemplateSelect = async (templateName) => {
    if (!templateName) return;
    try {
      const template = await getSystemTemplate(templateName);
      const systemFields = (template.fields || []).map((f, i) => ({
        id: `system-${i}-${Date.now()}`,
        name: f.name,
        description: f.description,
        strategy: f.strategy,
        source: 'system',
      }));

      // Keep existing non-empty custom fields; custom overrides system for same name
      const customFields = fields.filter(
        (f) => f.source === 'custom' && f.name.trim()
      );
      const customNames = new Set(
        customFields.map((f) => f.name.trim().toLowerCase())
      );
      const filteredSystem = systemFields.filter(
        (f) => !customNames.has(f.name.toLowerCase())
      );

      // Always keep at least one blank custom row so the user can add new fields
      const merged = [...filteredSystem, ...customFields];
      const hasBlankCustom = merged.some(
        (f) => f.source === 'custom' && !f.name.trim()
      );
      if (!hasBlankCustom) {
        merged.push({ ...DEFAULT_FIELD, id: `custom-${Date.now()}` });
      }

      setFields(merged);
      setSelectedTemplate(templateName);
      notifyChange(merged);
    } catch (err) {
      console.error('Failed to load template:', err);
    }
  };

  // ── Row CRUD ────────────────────────────────────────────────────────────────
  const handleAddField = () => {
    const newField = { ...DEFAULT_FIELD, id: `custom-${Date.now()}` };
    const updated = [...fields, newField];
    setFields(updated);
    notifyChange(updated);
  };

  const handleRemoveField = (id) => {
    if (fields.length === 1) return;
    const updated = fields.filter((f) => f.id !== id);
    setFields(updated);
    notifyChange(updated);
  };

  const handleFieldChange = (id, key, value) => {
    const updated = fields.map((f) => {
      if (f.id !== id) return f;
      // Editing a system field's name or description promotes it to custom
      const newSource =
        (key === 'name' || key === 'description') && f.source === 'system'
          ? 'custom'
          : f.source;
      return { ...f, [key]: value, source: newSource };
    });
    setFields(updated);
    notifyChange(updated);
  };

  // ── Notify parent (with deduplication: custom beats system for same name) ──
  const notifyChange = (updatedFields) => {
    if (!onFieldsChange) return;

    const seen = new Map();
    for (const field of updatedFields) {
      const key = field.name.trim().toLowerCase();
      if (!key) continue;
      const existing = seen.get(key);
      if (!existing || field.source === 'custom') {
        seen.set(key, field);
      }
    }

    const validFields = Array.from(seen.values())
      .filter((f) => f.name.trim() && f.description.trim())
      .map((f) => ({
        name: f.name.trim(),
        description: f.description.trim(),
        strategy: f.strategy,
        source: f.source,
      }));

    onFieldsChange(validFields);
  };

  // ── Reset ───────────────────────────────────────────────────────────────────
  const handleReset = () => {
    const blank = [{ ...DEFAULT_FIELD, id: `field-${Date.now()}` }];
    setFields(blank);
    setSelectedTemplate('');
    notifyChange(blank);
  };

  // ── Save config ─────────────────────────────────────────────────────────────
  const handleSaveConfig = async () => {
    if (!configName.trim()) return;
    setIsSaving(true);
    setSaveError('');
    try {
      const validFields = fields
        .filter((f) => f.name.trim() && f.description.trim())
        .map((f) => ({
          name: f.name.trim(),
          description: f.description.trim(),
          strategy: f.strategy,
          source: f.source,
        }));

      await saveUserConfig(configName.trim(), validFields);
      setSaveSuccess(`"${configName.trim()}" saved successfully!`);
      setConfigName('');
      setTimeout(() => {
        setSaveSuccess('');
        setShowSaveModal(false);
      }, 1800);
    } catch (err) {
      setSaveError('Failed to save. Please try again.');
      console.error('Save config error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Import modal open ───────────────────────────────────────────────────────
  const handleOpenImportModal = async () => {
    setShowImportModal(true);
    setImportTab('saved');
    setImportError('');
    setIsLoadingConfigs(true);
    try {
      const res = await listUserConfigs();
      setSavedConfigs(res.configs || []);
    } catch (err) {
      console.error('Failed to list configs:', err);
      setSavedConfigs([]);
    } finally {
      setIsLoadingConfigs(false);
    }
  };

  // ── Load saved config from server ───────────────────────────────────────────
  const handleLoadSavedConfig = async (name) => {
    setImportError('');
    try {
      const config = await getUserConfig(name);
      applyLoadedFields(config.fields || []);
      setShowImportModal(false);
    } catch (err) {
      setImportError(`Failed to load "${name}". Please try again.`);
      console.error('Load config error:', err);
    }
  };

  // ── Import local JSON file ──────────────────────────────────────────────────
  const handleLocalFileImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const fieldsData = Array.isArray(data) ? data : data.fields;
        if (!Array.isArray(fieldsData)) {
          setImportError('Invalid format: expected a JSON object with a "fields" array.');
          return;
        }
        applyLoadedFields(fieldsData);
        setShowImportModal(false);
      } catch {
        setImportError('Could not parse the JSON file. Please check the file format.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const applyLoadedFields = (fieldsData) => {
    const loaded = fieldsData.map((f, i) => ({
      id: `loaded-${i}-${Date.now()}`,
      name: f.name || '',
      description: f.description || '',
      strategy: f.strategy || 'Fake Data',
      source: f.source || 'custom',
    }));
    setFields(loaded);
    setSelectedTemplate('');
    notifyChange(loaded);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const isFormValid = () =>
    fields.some((f) => f.name.trim() && f.description.trim());

  /** True if this custom field shadows a system field with the same name */
  const isOverridingSystem = (field) => {
    if (field.source !== 'custom' || !field.name.trim()) return false;
    return fields.some(
      (f) =>
        f.source === 'system' &&
        f.name.trim().toLowerCase() === field.name.trim().toLowerCase()
    );
  };

  const validFieldCount = fields.filter(
    (f) => f.name.trim() && f.description.trim()
  ).length;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-4">

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            De-identification Rules
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Define which fields to identify and how to replace them
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* System template dropdown */}
          <div className="relative">
            <select
              value={selectedTemplate}
              onChange={(e) => handleTemplateSelect(e.target.value)}
              className="pl-3 pr-8 py-2 border border-blue-300 bg-blue-50 text-blue-800 rounded-lg text-sm appearance-none cursor-pointer hover:bg-blue-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            >
              <option value="">Load System Template…</option>
              {systemTemplates.map((t) => (
                <option key={t.template_name} value={t.template_name}>
                  {t.template_name} ({t.field_count} fields)
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-blue-500 pointer-events-none" />
          </div>

          <button
            onClick={handleAddField}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Row
          </button>

          <button
            onClick={() => { setSaveSuccess(''); setSaveError(''); setShowSaveModal(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            <Save className="w-4 h-4" />
            Save Config
          </button>

          <button
            onClick={handleOpenImportModal}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
          >
            <Upload className="w-4 h-4" />
            Import Config
          </button>

          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Reset
          </button>
        </div>
      </div>

      {/* ── Rules table ── */}
      <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">
                Source
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/4">
                Field Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">
                Strategy
              </th>
              <th className="px-3 py-3 w-12"></th>
            </tr>
          </thead>

          <tbody className="bg-white divide-y divide-gray-100">
            {fields.map((field) => {
              const isSystem = field.source === 'system';
              const overriding = isOverridingSystem(field);
              const rowBg = isSystem ? 'bg-blue-50/60' : 'bg-purple-50/50';
              const borderColor = isSystem ? 'border-l-blue-400' : 'border-l-purple-400';
              const inputBorder = isSystem ? 'border-blue-200 focus:ring-blue-400' : 'border-purple-200 focus:ring-purple-400';

              return (
                <tr
                  key={field.id}
                  className={`${rowBg} border-l-4 ${borderColor} transition-colors hover:brightness-95`}
                >
                  {/* Source badge */}
                  <td className="px-3 py-3 align-top pt-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                        isSystem
                          ? 'bg-blue-100 text-blue-700 border-blue-300'
                          : 'bg-purple-100 text-purple-700 border-purple-300'
                      }`}
                    >
                      {isSystem ? 'System' : 'Custom'}
                    </span>
                    {overriding && (
                      <p className="mt-1 text-xs text-amber-600 font-medium leading-tight">
                        ↑ overrides system
                      </p>
                    )}
                  </td>

                  {/* Field Name */}
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={field.name}
                      onChange={(e) => handleFieldChange(field.id, 'name', e.target.value)}
                      placeholder="e.g., Full Name"
                      className={`w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:border-transparent ${inputBorder}`}
                    />
                  </td>

                  {/* Description */}
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={field.description}
                      onChange={(e) => handleFieldChange(field.id, 'description', e.target.value)}
                      placeholder="e.g., Patient's full name including first and last"
                      className={`w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:border-transparent ${inputBorder}`}
                    />
                  </td>

                  {/* Strategy */}
                  <td className="px-4 py-3">
                    <div className="relative group">
                      <select
                        value={field.strategy}
                        onChange={(e) => handleFieldChange(field.id, 'strategy', e.target.value)}
                        className={`w-full px-3 py-2 border rounded-md text-sm bg-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:border-transparent ${inputBorder}`}
                      >
                        {STRATEGIES.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                      {/* Tooltip */}
                      <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-60 p-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl z-20 pointer-events-none">
                        {STRATEGIES.find((s) => s.value === field.strategy)?.description}
                      </div>
                    </div>
                  </td>

                  {/* Remove */}
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={() => handleRemoveField(field.id)}
                      disabled={fields.length === 1}
                      title={fields.length === 1 ? 'At least one row required' : 'Remove row'}
                      className={`p-1.5 rounded-full transition-colors ${
                        fields.length === 1
                          ? 'text-gray-300 cursor-not-allowed'
                          : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                      }`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-300 font-semibold text-xs">
            System
          </span>
          <span>Loaded from a system template</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-300 font-semibold text-xs">
            Custom
          </span>
          <span>Manually added or edited</span>
        </div>
      </div>

      {/* ── Strategy guide ── */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <HelpCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-1">Strategy Guide:</p>
          <ul className="space-y-0.5 ml-4 list-disc">
            <li><strong>Fake Data:</strong> Generates realistic replacements (e.g., John Doe → Emma Rodriguez)</li>
            <li><strong>Black Out:</strong> Redacts text with a solid black rectangle</li>
            <li><strong>Entity Label:</strong> Uses generic labels (e.g., Person_A, Email_1)</li>
          </ul>
        </div>
      </div>

      {/* ── Validation warning ── */}
      {!isFormValid() && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            Please fill in at least one complete row (Field Name + Description) before processing.
          </p>
        </div>
      )}

      {/* ══ Save Config Modal ══ */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Save Configuration</h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {saveSuccess ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
                  <Check className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm font-medium">{saveSuccess}</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Configuration Name
                    </label>
                    <input
                      type="text"
                      value={configName}
                      onChange={(e) => setConfigName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveConfig()}
                      placeholder="e.g., Healthcare PII, Patient Records…"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      autoFocus
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      {validFieldCount} complete field{validFieldCount !== 1 ? 's' : ''} will be saved
                    </p>
                  </div>

                  {saveError && (
                    <p className="text-sm text-red-600">{saveError}</p>
                  )}

                  <div className="flex gap-3 justify-end pt-1">
                    <button
                      onClick={() => setShowSaveModal(false)}
                      className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveConfig}
                      disabled={!configName.trim() || isSaving || validFieldCount === 0}
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {isSaving ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                      ) : (
                        <><Save className="w-4 h-4" /> Save</>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ Import Config Modal ══ */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Import Configuration</h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100">
              {[
                { id: 'saved', label: 'Saved Configs' },
                { id: 'file',  label: 'Local File' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { setImportTab(tab.id); setImportError(''); }}
                  className={`px-5 py-3 text-sm font-medium transition-colors ${
                    importTab === tab.id
                      ? 'text-purple-600 border-b-2 border-purple-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-6">
              {importError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {importError}
                </div>
              )}

              {/* Saved configs tab */}
              {importTab === 'saved' && (
                <div>
                  {isLoadingConfigs ? (
                    <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm">Loading saved configurations…</span>
                    </div>
                  ) : savedConfigs.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-sm text-gray-500">No saved configurations found.</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Use <strong>Save Config</strong> to persist your current setup.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {savedConfigs.map((cfg) => (
                        <button
                          key={cfg.filename}
                          onClick={() => handleLoadSavedConfig(cfg.config_name)}
                          className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 text-left transition-colors group"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-800">{cfg.config_name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {cfg.field_count} field{cfg.field_count !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <span className="text-xs text-purple-600 font-semibold group-hover:text-purple-800">
                            Load →
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Local file tab */}
              {importTab === 'file' && (
                <div>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-colors"
                  >
                    <Upload className="w-10 h-10 text-gray-300 mb-3" />
                    <p className="text-sm font-medium text-gray-600">Click to select a JSON file</p>
                    <p className="text-xs text-gray-400 mt-1">
                      A previously saved PrivaSee configuration
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleLocalFileImport}
                    className="hidden"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigPanel;
