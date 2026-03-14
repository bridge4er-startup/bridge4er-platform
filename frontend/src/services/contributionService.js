import API from "./api";

export const contributionService = {
  listCategories: async () => {
    const res = await API.get("contributions/categories/");
    return res.data;
  },

  listContributions: async (category = "", branch = "") => {
    const res = await API.get("contributions/list/", {
      params: {
        category,
        branch,
      },
    });
    return res.data;
  },

  listMyContributions: async () => {
    const res = await API.get("contributions/me/");
    return res.data;
  },

  uploadContribution: async (payload) => {
    const res = await API.post("contributions/upload/", payload, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  addComment: async (contributionId, text) => {
    const res = await API.post(`contributions/${contributionId}/comment/`, { text });
    return res.data;
  },

  deleteComment: async (commentId) => {
    const res = await API.delete(`contributions/comments/${commentId}/`);
    return res.data;
  },

  adminListContributions: async (status = "all", category = "") => {
    const res = await API.get("contributions/admin/list/", {
      params: { status, category },
    });
    return res.data;
  },

  adminUpdateContribution: async (contributionId, payload) => {
    const res = await API.patch(`contributions/admin/${contributionId}/`, payload);
    return res.data;
  },

  adminDeleteContribution: async (contributionId) => {
    const res = await API.delete(`contributions/admin/${contributionId}/`);
    return res.data;
  },

  adminCreateCategory: async (name) => {
    const res = await API.post("contributions/categories/admin/", { name });
    return res.data;
  },

  adminDeleteCategory: async (payload) => {
    const res = await API.delete("contributions/categories/admin/", { data: payload });
    return res.data;
  },

  claimUnlock: async (examSetName) => {
    const res = await API.post("contributions/unlock/", { exam_set_name: examSetName });
    return res.data;
  },
};
