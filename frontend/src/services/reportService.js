import API from "./api";

export const reportService = {
  submitReport: async (payload) => {
    const response = await API.post("exams/problem-reports/", payload);
    return response.data;
  },

  listReports: async (statusFilter = "all") => {
    const params = statusFilter && statusFilter !== "all" ? { status: statusFilter } : {};
    const response = await API.get("exams/problem-reports/", { params });
    return response.data;
  },

  updateReport: async (reportId, payload) => {
    const response = await API.post(`exams/problem-reports/${reportId}/`, payload);
    return response.data;
  },

  deleteReport: async (reportId) => {
    const response = await API.delete(`exams/problem-reports/${reportId}/`);
    return response.data;
  },
};
