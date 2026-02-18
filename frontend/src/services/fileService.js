import API from "./api";

export const fileService = {
  // List files by content type
  listFiles: async (contentType, branch = "Civil Engineering") => {
    try {
      const response = await API.get("storage/files/list/", {
        params: {
          content_type: contentType,
          branch,
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error listing files:", error);
      throw error;
    }
  },

  // Search files
  searchFiles: async (query, contentType, branch = "Civil Engineering") => {
    try {
      const response = await API.get("storage/files/search/", {
        params: {
          q: query,
          content_type: contentType,
          branch,
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error searching files:", error);
      throw error;
    }
  },

  // Download file
  downloadFile: async (path) => {
    try {
      const response = await API.get("storage/files/download/", {
        params: { path },
        responseType: "blob",
      });
      return response.data;
    } catch (error) {
      console.error("Error downloading file:", error);
      throw error;
    }
  },

  // Get view link for file
  getViewLink: async (path) => {
    try {
      const response = await API.get("storage/files/view/", {
        params: { path },
      });
      return response.data.link;
    } catch (error) {
      console.error("Error getting view link:", error);
      throw error;
    }
  },

  // Upload file (admin only)
  uploadFile: async (file, contentType, branch = "Civil Engineering") => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("content_type", contentType);
      formData.append("branch", branch);

      const response = await API.post("storage/files/upload/", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error uploading file:", error);
      throw error;
    }
  },

  // Delete file (admin only)
  deleteFile: async (path) => {
    try {
      const response = await API.post("storage/files/delete/", { path });
      return response.data;
    } catch (error) {
      console.error("Error deleting file:", error);
      throw error;
    }
  },
};
