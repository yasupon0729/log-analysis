export const ANALYSIS_RESULTS_SELECT_FIELDS = `
  iaa.id AS analysisDataId,
  iaa.user_id AS userId,
  iaa.image_analysis_id AS imageAnalysisId,
  iaa.sent_at AS sentAt,
  iaa.sent_status AS sentStatus,
  iaa.analyzer_name AS analyzerName,
  iaa.status AS analysisStatus,
  iaa.analysis_type AS analysisType,
  iaa.download_link AS downloadLink,
  iaa.total_count AS totalCount,
  iaa.completed_count AS completedCount,
  iaa.incomplete_count AS incompleteCount,
  iaa.notes AS notes,
  iaa.send_email_list AS sendEmailList,
  iaa.etag AS etag,
  iaa.dummy_result AS dummyResult,
  iai.title AS imageAnalysisTitle,
  iai.file_name AS imageAnalysisFileName,
  iai.original_image AS originalImage,
  iai.processed_image AS processedImage,
  iai.uploaded_at AS imageUploadedAt,
  iai.unit AS imageUnit,
  iai.scaling_factor AS imageScalingFactor,
  acu.username AS username,
  acu.company_name AS companyName,
  acu.email AS userEmail
`;

export const ANALYSIS_RESULTS_FROM_CLAUSE = `
  FROM image_analysis_analysisdata AS iaa
  LEFT JOIN image_analysis_imageanalysis AS iai ON iai.id = iaa.image_analysis_id
  LEFT JOIN accounts_customuser AS acu ON acu.id = iaa.user_id
`;

export const ANALYSIS_RESULTS_BASE_CONDITION = "iaa.is_deleted = 0";

export const ANALYSIS_RESULTS_DEFAULT_ORDER = `
  ORDER BY iaa.sent_at DESC, iaa.id DESC
`;
