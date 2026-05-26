import API, { API_SYNC_TIMEOUT_MS, cachedGet } from "./api";

export const fileService = {
  // List files by content type
  listFiles: async (
    contentType,
    branch = "Civil Engineering",
    includeHidden = false,
    includeDirs = false,
    refresh = false,
    preferMetadata = true,
    metadataOnly = true
  ) => {
    try {
      const response = await cachedGet("storage/files/list/", {
        params: {
          content_type: contentType,
          branch,
          include_hidden: includeHidden,
          include_dirs: includeDirs,
          refresh: !!refresh,
          prefer_metadata: !!preferMetadata && !refresh,
          metadata_only: !!metadataOnly && !refresh,
        },
        forceRefresh: !!refresh,
        persistCache: true,
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
  setVisibility: async (path, isVisible, isDir = false) => {
    try {
      const response = await API.post("storage/files/visibility/", {
        path,
        is_visible: !!isVisible,
        is_dir: !!isDir,
      });
      return response.data;
    } catch (error) {
      console.error("Error updating file visibility:", error);
      throw error;
    }
  },

  // Sync storage metadata/list caches for selected content types (admin only)
  syncContent: async (
    branch = "Civil Engineering",
    contentTypes = [],
    warmCache = true,
    syncQuestions = true
  ) => {
    try {
      const payload = {
        branch,
        warm_cache: !!warmCache,
        sync_questions: !!syncQuestions,
      };
      if (Array.isArray(contentTypes) && contentTypes.length > 0) {
        payload.content_types = contentTypes;
      }
      const response = await API.post("storage/files/sync/", payload, {
        timeout: API_SYNC_TIMEOUT_MS,
      });
      return response.data;
    } catch (error) {
      console.error("Error syncing storage content:", error);
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

  syncPath: async (pathOrPayload, includeDirs = true) => {
    try {
      const payload =
        pathOrPayload && typeof pathOrPayload === "object"
          ? { ...pathOrPayload }
          : { path: pathOrPayload, include_dirs: !!includeDirs };
      if (payload.include_dirs === undefined) {
        payload.include_dirs = !!includeDirs;
      }
      const response = await API.post(
        "storage/files/sync-path/",
        payload,
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

  resetContent: async (payload = {}) => {
    try {
      const response = await API.post("storage/files/reset/", payload);
      return response.data;
    } catch (error) {
      console.error("Error resetting storage metadata:", error);
      throw error;
    }
  },
};
