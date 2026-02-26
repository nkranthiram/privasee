/**
 * BatchInputPanel Component
 * Folder path input with PDF preview for batch processing mode.
 */

import { useState } from 'react';
import { FolderOpen, Search, FileText, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { scanBatchFolder } from '../services/api';

const BatchInputPanel = ({ onFolderReady }) => {
  const [folderPath, setFolderPath] = useState('');
  const [pdfFiles, setPdfFiles] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState('');
  const [scanned, setScanned] = useState(false);

  const handleScan = async () => {
    const path = folderPath.trim();
    if (!path) return;

    setIsScanning(true);
    setError('');
    setPdfFiles([]);
    setScanned(false);

    try {
      const result = await scanBatchFolder(path);
      setPdfFiles(result.pdf_files);
      setScanned(true);
      onFolderReady(path, result.pdf_files);
    } catch (err) {
      setError(err.message || 'Could not scan folder. Check the path and try again.');
      onFolderReady('', []);
    } finally {
      setIsScanning(false);
    }
  };

  const handlePathChange = (e) => {
    setFolderPath(e.target.value);
    // Reset scan state when path changes
    if (scanned) {
      setScanned(false);
      setPdfFiles([]);
      onFolderReady('', []);
    }
  };

  return (
    <div className="space-y-4">
      {/* Folder path input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Folder Path
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <FolderOpen className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={folderPath}
              onChange={handlePathChange}
              onKeyDown={(e) => e.key === 'Enter' && !isScanning && handleScan()}
              placeholder="/Users/you/Documents/patient-records"
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={handleScan}
            disabled={!folderPath.trim() || isScanning}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {isScanning
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Search className="w-4 h-4" />
            }
            Scan
          </button>
        </div>
        <p className="mt-1.5 text-xs text-gray-500">
          Paste the absolute path to your folder. Masked PDFs will be saved there with a{' '}
          <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">masked_</code> prefix.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* No PDFs found */}
      {scanned && pdfFiles.length === 0 && !error && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
          No eligible PDFs found in this folder. Files already named{' '}
          <code className="bg-yellow-100 px-1 rounded font-mono text-xs">masked_*.pdf</code> are
          excluded.
        </div>
      )}

      {/* PDF list */}
      {scanned && pdfFiles.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">
              {pdfFiles.length} PDF{pdfFiles.length !== 1 ? 's' : ''} ready to process
            </p>
            <span className="text-xs text-gray-400">
              Output will be saved to the same folder
            </span>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-52 overflow-y-auto">
            {pdfFiles.map((filename, i) => (
              <div
                key={filename}
                className={`flex items-center gap-3 px-3 py-2.5 text-sm ${
                  i % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                }`}
              >
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-gray-700 truncate flex-1">{filename}</span>
                <ArrowRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
                <span className="text-gray-400 font-mono text-xs truncate max-w-[180px]">
                  masked_{filename}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchInputPanel;
