/**
 * API Service
 * Client for backend API communication
 */

import axios from 'axios';

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: '/api',
  // No global timeout — per-call timeouts are set below
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const errorMessage = error.response?.data?.detail || error.message || 'An error occurred';
    console.error('API Error:', errorMessage);
    return Promise.reject(new Error(errorMessage));
  }
);

/**
 * Upload PDF file
 * @param {File} file - PDF file to upload
 * @returns {Promise<Object>} Upload response with session_id
 */
export const uploadPdf = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 120000, // 2 min — upload + image extraction for large PDFs
  });

  return response.data;
};

/**
 * Process document to extract entities
 * @param {string} sessionId - Session identifier
 * @param {Array} fieldDefinitions - Array of field definitions
 * @returns {Promise<Object>} Process response with entities
 */
export const processDocument = async (sessionId, fieldDefinitions) => {
  const response = await apiClient.post('/process', {
    session_id: sessionId,
    field_definitions: fieldDefinitions,
  }, {
    timeout: 900000, // 15 min — OCR + Claude per page, up to ~30 pages
  });

  return response.data;
};

/**
 * Approve entities and generate masked PDF
 * @param {string} sessionId - Session identifier
 * @param {Array<string>} approvedEntityIds - Array of entity IDs to mask
 * @param {Array} updatedEntities - Optional array of entities with updated replacement text
 * @returns {Promise<Object>} Approval response with PDF URLs
 */
export const approveAndMask = async (sessionId, approvedEntityIds, updatedEntities = null) => {
  const response = await apiClient.post('/approve-and-mask', {
    session_id: sessionId,
    approved_entity_ids: approvedEntityIds,
    updated_entities: updatedEntities,
  }, {
    timeout: 300000, // 5 min — masking all pages + PDF assembly
  });

  return response.data;
};

/**
 * Get session information
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object>} Session information
 */
export const getSessionInfo = async (sessionId) => {
  const response = await apiClient.get(`/sessions/${sessionId}`);
  return response.data;
};

/**
 * Delete session and associated files
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object>} Deletion confirmation
 */
export const deleteSession = async (sessionId) => {
  const response = await apiClient.delete(`/sessions/${sessionId}`);
  return response.data;
};

/**
 * Health check
 * @returns {Promise<Object>} Health status
 */
export const healthCheck = async () => {
  const response = await apiClient.get('/health');
  return response.data;
};

// ─── Strategy & Config API ────────────────────────────────────────────────────

/**
 * List all available system strategy templates
 * @returns {Promise<{templates: Array}>}
 */
export const getSystemTemplates = async () => {
  const response = await apiClient.get('/strategies/system');
  return response.data;
};

/**
 * Get a specific system template by name
 * @param {string} templateName
 * @returns {Promise<Object>} Template with fields
 */
export const getSystemTemplate = async (templateName) => {
  const response = await apiClient.get(`/strategies/system/${encodeURIComponent(templateName)}`);
  return response.data;
};

/**
 * Save the current field configuration to the backend user_configs folder
 * @param {string} configName - Name for the saved config
 * @param {Array} fields - Array of field definitions
 * @returns {Promise<Object>}
 */
export const saveUserConfig = async (configName, fields) => {
  const response = await apiClient.post('/configs', { config_name: configName, fields });
  return response.data;
};

/**
 * List all saved user configurations
 * @returns {Promise<{configs: Array}>}
 */
export const listUserConfigs = async () => {
  const response = await apiClient.get('/configs');
  return response.data;
};

/**
 * Load a specific saved user configuration by name
 * @param {string} configName
 * @returns {Promise<Object>} Config with fields
 */
export const getUserConfig = async (configName) => {
  const response = await apiClient.get(`/configs/${encodeURIComponent(configName)}`);
  return response.data;
};

// ─── Batch Processing API ─────────────────────────────────────────────────────

/**
 * Scan a local folder and return eligible PDF filenames
 * @param {string} folderPath - Absolute path to the folder
 * @returns {Promise<{folder_path: string, pdf_files: string[], count: number}>}
 */
export const scanBatchFolder = async (folderPath) => {
  // POST with JSON body to avoid URL encoding issues with path separators
  const response = await apiClient.post('/batch/scan', { folder_path: folderPath }, {
    timeout: 10000,
  });
  return response.data;
};

/**
 * Process all PDFs in a local folder through the full de-identification pipeline
 * @param {string} folderPath - Absolute path to the folder
 * @param {Array} fieldDefinitions - Field definitions from ConfigPanel
 * @returns {Promise<BatchResponse>}
 */
export const processBatch = async (folderPath, fieldDefinitions) => {
  const response = await apiClient.post('/batch', {
    folder_path: folderPath,
    field_definitions: fieldDefinitions,
  }, {
    timeout: 1800000, // 30 min — large batches can take time
  });
  return response.data;
};

/**
 * Get file URL
 * @param {string} folder - Folder name (uploads, temp_images, output)
 * @param {string} filename - File name
 * @returns {string} File URL
 */
export const getFileUrl = (folder, filename) => {
  return `/api/files/${folder}/${filename}`;
};

/**
 * Build file URL from API path
 * @param {string} path - API path (e.g., '/api/files/uploads/file.pdf')
 * @returns {string} Full URL
 */
export const buildFileUrl = (path) => {
  return path.startsWith('/api') ? path : `/api${path}`;
};

export default {
  uploadPdf,
  processDocument,
  approveAndMask,
  getSessionInfo,
  deleteSession,
  healthCheck,
  getFileUrl,
  buildFileUrl,
  getSystemTemplates,
  getSystemTemplate,
  saveUserConfig,
  listUserConfigs,
  getUserConfig,
  scanBatchFolder,
  processBatch,
};
