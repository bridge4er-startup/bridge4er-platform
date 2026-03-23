import API, { API_SYNC_TIMEOUT_MS } from "./api";

export const fileService = {
  // List files by content type
  listFiles: async (
    contentType,
    branch = "Civil Engineering",
    includeHidden = false,
    includeDirs = false,
    refresh = false
  ) => {
    try {
      const response = await API.get("storage/files/list/", {
        params: {
          content_type: contentType,
          branch,
          include_hidden: includeHidden,
          include_dirs: includeDirs,
          refresh: !!refresh,
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
  uploadFile: async (file, contentType, branch = "Civil Engineering", folderPath = "", isVisible = null) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("content_type", contentType);
      formData.append("branch", branch);
      if (folderPath) {
        formData.append("folder_path", folderPath);
      }
      if (isVisible !== null && isVisible !== undefined) {
        formData.append("is_visible", String(!!isVisible));
      }

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

  // Toggle file visibility on website (admin only)
  setVisibility: async (path, isVisible) => {
    try {
      const response = await API.post("storage/files/visibility/", {
        path,
        is_visible: !!isVisible,
      });
      return response.data;
    } catch (error) {
      console.error("Error updating file visibility:", error);
      throw error;
    }
  },

  // Sync Dropbox metadata/list caches for selected content types (admin only)
  syncContent: async (branch = "Civil Engineering", contentTypes = [], warmCache = true) => {
    try {
      const payload = {
        branch,
        warm_cache: !!warmCache,
      };
      if (Array.isArray(contentTypes) && contentTypes.length > 0) {
        payload.content_types = contentTypes;
      }
      const response = await API.post("storage/files/sync/", payload, {
        timeout: API_SYNC_TIMEOUT_MS,
      });
      return response.data;
    } catch (error) {
      console.error("Error syncing Dropbox content:", error);
      throw error;
    }
  },

  updateMetadata: async (path, payload = {}, isDir = false) => {
    try {
      const response = await API.post("storage/files/metadata/", {
        path,
        is_dir: !!isDir,
        ...payload,
      });
      return response.data;
    } catch (error) {
      console.error("Error updating metadata:", error);
      throw error;
    }
  },

  renamePath: async (path, newPath) => {
    try {
      const response = await API.post("storage/files/rename/", {
        path,
        new_path: newPath,
      });
      return response.data;
    } catch (error) {
      console.error("Error renaming path:", error);
      throw error;
    }
  },

  createFolder: async (payload = {}) => {
    try {
      const response = await API.post("storage/files/create-folder/", payload);
      return response.data;
    } catch (error) {
      console.error("Error creating folder:", error);
      throw error;
    }
  },

  syncPath: async (path, includeDirs = true) => {
    try {
      const response = await API.post(
        "storage/files/sync-path/",
        {
          path,
          include_dirs: !!includeDirs,
        },
        { timeout: API_SYNC_TIMEOUT_MS }
      );
      return response.data;
    } catch (error) {
      console.error("Error syncing path:", error);
      throw error;
    }
  },

  attachPath: async (payload = {}) => {
    try {
      const response = await API.post("storage/files/attach/", payload);
      return response.data;
    } catch (error) {
      console.error("Error attaching path:", error);
      throw error;
    }
  },
};
