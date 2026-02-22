import API from "./api";

export const listExamSets = async (branch, examType, refresh = false) => {
  const res = await API.get("exams/sets/", {
    params: { branch, exam_type: examType, refresh: !!refresh },
  });
  return res.data;
};

export const startExamSet = async (setId) => {
  const res = await API.get(`exams/sets/${setId}/start/`);
  return res.data;
};

export const submitExamSet = async (setId, answers) => {
  const res = await API.post(`exams/sets/${setId}/submit/`, { answers });
  return res.data;
};

export const uploadSubjective = async (formData) => {
  const res = await API.post("exams/subjective/submissions/", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

export const getMySubjectiveSubmissions = async () => {
  const res = await API.get("exams/subjective/submissions/my/");
  return res.data;
};

export const listSubjectiveSubmissionsForAdmin = async (statusFilter = "all") => {
  const params = statusFilter && statusFilter !== "all" ? { status: statusFilter } : {};
  const res = await API.get("exams/subjective/submissions/", { params });
  return res.data;
};

export const reviewSubjectiveSubmission = async (submissionId, payload) => {
  const res = await API.post(`exams/subjective/submissions/${submissionId}/review/`, payload);
  return res.data;
};

export const getUserAnalytics = async () => {
  const res = await API.get("exams/profile/analytics/");
  return res.data;
};
