/**
 * PrivaSee App Component
 * Main application orchestrating the de-identification workflow.
 * Supports both Single Document and Batch (folder) modes.
 */

import { useState } from 'react';
import { Shield, Loader2, AlertCircle, FileText, FolderOpen } from 'lucide-react';
import UploadZone from './components/UploadZone';
import ConfigPanel from './components/ConfigPanel';
import ReviewTable from './components/ReviewTable';
import ComparisonView from './components/ComparisonView';
import BatchInputPanel from './components/BatchInputPanel';
import BatchResultsView from './components/BatchResultsView';
import { uploadPdf, processDocument, approveAndMask, processBatch } from './services/api';

// ── Step enums ─────────────────────────────────────────────────────────────────
const STEPS = {
  CONFIGURE:        'configure',
  REVIEW:           'review',
  COMPARE:          'compare',
  BATCH_PROCESSING: 'batch_processing',
  BATCH_RESULTS:    'batch_results',
};

const MODES = { SINGLE: 'single', BATCH: 'batch' };

// ── Step indicator config (single-doc flow) ────────────────────────────────────
const SINGLE_STEPS = [
  { key: STEPS.CONFIGURE, label: 'Configure', num: 1 },
  { key: STEPS.REVIEW,    label: 'Review',    num: 2 },
  { key: STEPS.COMPARE,   label: 'Compare',   num: 3 },
];

function stepIndex(step) {
  return SINGLE_STEPS.findIndex((s) => s.key === step);
}

// ── App ────────────────────────────────────────────────────────────────────────
function App() {
  // ── Mode ────────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState(MODES.SINGLE);

  // ── Shared ──────────────────────────────────────────────────────────────────
  const [step, setStep]                       = useState(STEPS.CONFIGURE);
  const [fieldDefinitions, setFieldDefinitions] = useState([]);
  const [error, setError]                     = useState(null);

  // ── Single-doc state ─────────────────────────────────────────────────────────
  const [sessionId, setSessionId]           = useState(null);
  const [filename, setFilename]             = useState(null);
  const [pageCount, setPageCount]           = useState(1);
  const [entities, setEntities]             = useState([]);
  const [originalPdfUrl, setOriginalPdfUrl] = useState(null);
  const [maskedPdfUrl, setMaskedPdfUrl]     = useState(null);
  const [entitiesMasked, setEntitiesMasked] = useState(0);
  const [isUploading, setIsUploading]       = useState(false);
  const [isProcessing, setIsProcessing]     = useState(false);
  const [isGenerating, setIsGenerating]     = useState(false);

  // ── Batch state ──────────────────────────────────────────────────────────────
  const [batchFolderPath, setBatchFolderPath] = useState('');
  const [batchPdfFiles, setBatchPdfFiles]     = useState([]);
  const [batchResults, setBatchResults]       = useState(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // ── Mode switch ──────────────────────────────────────────────────────────────
  const switchMode = (newMode) => {
    setMode(newMode);
    setStep(STEPS.CONFIGURE);
    setError(null);
  };

  // ── Single-doc handlers ───────────────────────────────────────────────────────
  const handleUploadSuccess = async (file) => {
    setError(null);
    setIsUploading(true);
    try {
      const response = await uploadPdf(file);
      setSessionId(response.session_id);
      setFilename(response.filename);
      setPageCount(response.page_count ?? 1);
      setOriginalPdfUrl(`/api/files/uploads/${response.session_id}.pdf`);
    } catch (err) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFieldsChange = (fields) => setFieldDefinitions(fields);

  const handleProcessDocument = async () => {
    if (!sessionId || fieldDefinitions.length === 0) {
      setError('Please upload a document and define at least one field.');
      return;
    }
    setError(null);
    setIsProcessing(true);
    try {
      const response = await processDocument(sessionId, fieldDefinitions);
      setEntities(response.entities);
      setStep(STEPS.REVIEW);
    } catch (err) {
      setError(`Processing failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = async (approvedEntities) => {
    if (approvedEntities.length === 0) {
      setError('Please select at least one entity to mask.');
      return;
    }
    setError(null);
    setIsGenerating(true);
    try {
      const approvedIds = approvedEntities.map((e) => e.id);
      const response = await approveAndMask(sessionId, approvedIds, approvedEntities);
      setMaskedPdfUrl(response.masked_pdf_url);
      setEntitiesMasked(response.entities_masked);
      setStep(STEPS.COMPARE);
    } catch (err) {
      setError(`Masking failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSingleReset = () => {
    setStep(STEPS.CONFIGURE);
    setSessionId(null);
    setFilename(null);
    setPageCount(1);
    setFieldDefinitions([]);
    setEntities([]);
    setOriginalPdfUrl(null);
    setMaskedPdfUrl(null);
    setEntitiesMasked(0);
    setError(null);
  };

  // ── Batch handlers ────────────────────────────────────────────────────────────
  const handleFolderReady = (path, files) => {
    setBatchFolderPath(path);
    setBatchPdfFiles(files);
    setError(null);
  };

  const handleProcessBatch = async () => {
    if (!batchFolderPath || batchPdfFiles.length === 0) {
      setError('Please scan a folder with at least one PDF first.');
      return;
    }
    if (fieldDefinitions.length === 0) {
      setError('Please define at least one field to mask.');
      return;
    }
    setError(null);
    setIsBatchProcessing(true);
    setStep(STEPS.BATCH_PROCESSING);
    try {
      const response = await processBatch(batchFolderPath, fieldDefinitions);
      setBatchResults(response);
      setStep(STEPS.BATCH_RESULTS);
    } catch (err) {
      setError(`Batch processing failed: ${err.message}`);
      setStep(STEPS.CONFIGURE);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleBatchReset = () => {
    setStep(STEPS.CONFIGURE);
    setBatchFolderPath('');
    setBatchPdfFiles([]);
    setBatchResults(null);
    setFieldDefinitions([]);
    setError(null);
  };

  // ── Derived ───────────────────────────────────────────────────────────────────
  const canProcessSingle = sessionId && fieldDefinitions.length > 0;
  const canProcessBatch  = batchFolderPath && batchPdfFiles.length > 0 && fieldDefinitions.length > 0;
  const currentStepIndex = stepIndex(step);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">

      {/* ── Header ── */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary-600 rounded-lg">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">PrivaSee</h1>
              <p className="text-sm text-gray-500">Intelligent Document De-identification</p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Mode toggle (only show on configure screen) ── */}
        {step === STEPS.CONFIGURE && (
          <div className="flex justify-center mb-8">
            <div className="inline-flex bg-white rounded-xl shadow-sm border border-gray-200 p-1">
              <button
                onClick={() => switchMode(MODES.SINGLE)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  mode === MODES.SINGLE
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <FileText className="w-4 h-4" />
                Single Document
              </button>
              <button
                onClick={() => switchMode(MODES.BATCH)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  mode === MODES.BATCH
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <FolderOpen className="w-4 h-4" />
                Batch (Folder)
              </button>
            </div>
          </div>
        )}

        {/* ── Single-doc step indicator ── */}
        {mode === MODES.SINGLE && step !== STEPS.BATCH_RESULTS && step !== STEPS.BATCH_PROCESSING && (
          <div className="mb-8">
            <div className="flex items-center justify-center space-x-4">
              {SINGLE_STEPS.map((s, i) => (
                <div key={s.key} className="flex items-center">
                  {i > 0 && <div className="w-16 h-1 bg-gray-300 rounded mr-4"></div>}
                  <div className="flex items-center">
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold ${
                        currentStepIndex === i
                          ? 'bg-primary-600 text-white'
                          : currentStepIndex > i
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-300 text-gray-600'
                      }`}
                    >
                      {s.num}
                    </div>
                    <span className="ml-2 text-sm font-medium text-gray-700">{s.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Error banner ── */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">Error</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800 text-lg leading-none">
              ×
            </button>
          </div>
        )}

        {/* ── Content card ── */}
        <div className="bg-white rounded-xl shadow-lg p-8">

          {/* ════════════ CONFIGURE ════════════ */}
          {step === STEPS.CONFIGURE && (
            <div className="space-y-8">

              {/* ── Single doc upload ── */}
              {mode === MODES.SINGLE && (
                <>
                  <UploadZone onUploadSuccess={handleUploadSuccess} disabled={isUploading} />

                  {sessionId && (
                    <>
                      {pageCount > 1 && (
                        <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                          Multi-page PDF detected: <strong>{pageCount} pages</strong> will all be processed.
                        </div>
                      )}
                      <div className="border-t border-gray-200 pt-8">
                        <ConfigPanel onFieldsChange={handleFieldsChange} />
                      </div>
                      <div className="flex justify-end pt-4">
                        <button
                          onClick={handleProcessDocument}
                          disabled={!canProcessSingle || isProcessing}
                          className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all ${
                            !canProcessSingle || isProcessing
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-primary-600 text-white hover:bg-primary-700'
                          }`}
                        >
                          {isProcessing && <Loader2 className="w-5 h-5 animate-spin" />}
                          <span>{isProcessing ? 'Processing…' : 'Process Document'}</span>
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── Batch folder input ── */}
              {mode === MODES.BATCH && (
                <>
                  <BatchInputPanel onFolderReady={handleFolderReady} />

                  {batchPdfFiles.length > 0 && (
                    <>
                      <div className="border-t border-gray-200 pt-8">
                        <ConfigPanel onFieldsChange={handleFieldsChange} />
                      </div>
                      <div className="flex justify-end pt-4">
                        <button
                          onClick={handleProcessBatch}
                          disabled={!canProcessBatch || isBatchProcessing}
                          className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all ${
                            !canProcessBatch || isBatchProcessing
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-primary-600 text-white hover:bg-primary-700'
                          }`}
                        >
                          {isBatchProcessing && <Loader2 className="w-5 h-5 animate-spin" />}
                          <span>
                            {isBatchProcessing
                              ? 'Processing…'
                              : `Process ${batchPdfFiles.length} Document${batchPdfFiles.length !== 1 ? 's' : ''}`}
                          </span>
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* ════════════ REVIEW (single-doc only) ════════════ */}
          {step === STEPS.REVIEW && (
            <div className="space-y-6">
              {isGenerating ? (
                <div className="flex items-center justify-center space-x-3 p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                  <p className="text-lg font-medium text-gray-700">Generating masked PDF…</p>
                </div>
              ) : (
                <>
                  <ReviewTable
                    entities={entities}
                    onEntitiesChange={setEntities}
                    onApprove={handleApprove}
                  />
                  <div className="flex justify-between pt-4">
                    <button
                      onClick={() => setStep(STEPS.CONFIGURE)}
                      className="px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Back to Configure
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ════════════ COMPARE (single-doc only) ════════════ */}
          {step === STEPS.COMPARE && (
            <ComparisonView
              originalPdfUrl={originalPdfUrl}
              maskedPdfUrl={maskedPdfUrl}
              entitiesMasked={entitiesMasked}
              onReset={handleSingleReset}
            />
          )}

          {/* ════════════ BATCH PROCESSING spinner ════════════ */}
          {step === STEPS.BATCH_PROCESSING && (
            <div className="flex flex-col items-center justify-center py-20 space-y-5">
              <Loader2 className="w-14 h-14 animate-spin text-primary-600" />
              <div className="text-center">
                <p className="text-xl font-semibold text-gray-800">
                  Processing batch…
                </p>
                <p className="text-sm text-gray-500 mt-2 max-w-sm">
                  Running OCR, extracting entities, applying masks, and verifying
                  each document. This may take several minutes for large batches.
                </p>
              </div>
            </div>
          )}

          {/* ════════════ BATCH RESULTS ════════════ */}
          {step === STEPS.BATCH_RESULTS && batchResults && (
            <BatchResultsView
              results={batchResults.results}
              batchScore={batchResults.batch_score}
              outputFolder={batchResults.output_folder}
              totalDocuments={batchResults.total_documents}
              successfulDocuments={batchResults.successful_documents}
              onReset={handleBatchReset}
            />
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="mt-12 pb-8 text-center text-sm text-gray-600">
        <p>PrivaSee — Powered by Azure Document Intelligence and Claude AI</p>
        <p className="mt-2">All processing happens locally. Your privacy is our priority.</p>
      </footer>
    </div>
  );
}

export default App;
