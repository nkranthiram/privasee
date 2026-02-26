/**
 * BatchResultsView Component
 * Results table after batch processing — per-doc stats, score, and batch total.
 */

import { CheckCircle, XCircle, FolderOpen, RefreshCw, AlertTriangle } from 'lucide-react';

const ScoreBadge = ({ score }) => {
  if (score >= 90)
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
        {score}%
      </span>
    );
  if (score >= 70)
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
        {score}%
      </span>
    );
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      {score}%
    </span>
  );
};

const BatchResultsView = ({ results, batchScore, outputFolder, totalDocuments, successfulDocuments, onReset }) => {
  const totalToMask = results.reduce((s, r) => s + r.entities_to_mask, 0);
  const totalMasked = results.reduce((s, r) => s + r.entities_masked, 0);
  const failedDocs = results.filter((r) => r.status === 'error');

  return (
    <div className="space-y-6">

      {/* ── Completion banner ── */}
      <div className="flex items-start gap-4 p-5 bg-green-50 border border-green-200 rounded-xl">
        <CheckCircle className="w-7 h-7 text-green-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-lg font-semibold text-green-900">
            Batch processing complete
          </p>
          <p className="text-sm text-green-700 mt-0.5">
            {successfulDocuments} of {totalDocuments} document
            {totalDocuments !== 1 ? 's' : ''} de-identified successfully.
            {failedDocs.length > 0 && (
              <span className="ml-1 text-amber-700 font-medium">
                {failedDocs.length} document{failedDocs.length !== 1 ? 's' : ''} failed — see table below.
              </span>
            )}
          </p>
          <div className="flex items-center gap-1.5 mt-2 text-sm text-green-700">
            <FolderOpen className="w-4 h-4 flex-shrink-0" />
            <span className="font-mono text-xs break-all">{outputFolder}</span>
          </div>
        </div>

        {/* Batch score pill */}
        <div className="flex flex-col items-center justify-center bg-white border border-green-200 rounded-xl px-5 py-3 min-w-[90px] shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{batchScore}%</p>
          <p className="text-xs text-gray-500 mt-0.5 text-center">Batch Score</p>
        </div>
      </div>

      {/* ── Results table ── */}
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Document
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">
                Entities Found
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">
                Entities Masked
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">
                Score
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">
                Status
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100 bg-white">
            {results.map((r) => (
              <tr key={r.filename} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-800">{r.filename}</p>
                  {r.status === 'success' && (
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">
                      → {r.masked_filename}
                    </p>
                  )}
                  {r.error && (
                    <p className="text-xs text-red-500 mt-0.5 flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      {r.error}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-sm text-gray-700">
                  {r.status === 'success' ? r.entities_to_mask : '—'}
                </td>
                <td className="px-4 py-3 text-center text-sm text-gray-700">
                  {r.status === 'success' ? r.entities_masked : '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  {r.status === 'success' ? (
                    <ScoreBadge score={r.score} />
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {r.status === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500 mx-auto" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>

          {/* Totals row */}
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr>
              <td className="px-4 py-3 text-sm font-bold text-gray-800">
                Batch Total ({successfulDocuments}/{totalDocuments} documents)
              </td>
              <td className="px-4 py-3 text-center text-sm font-bold text-gray-800">
                {totalToMask}
              </td>
              <td className="px-4 py-3 text-center text-sm font-bold text-gray-800">
                {totalMasked}
              </td>
              <td className="px-4 py-3 text-center">
                <ScoreBadge score={batchScore} />
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Score legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-green-400"></span>≥ 90% — Excellent
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-amber-400"></span>70–89% — Review recommended
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-red-400"></span>&lt; 70% — Masking may be incomplete
        </span>
      </div>

      {/* Reset */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Process Another Batch
        </button>
      </div>
    </div>
  );
};

export default BatchResultsView;
