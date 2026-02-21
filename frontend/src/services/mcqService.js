import API from "./api";

export const mcqService = {
  // Get all subjects for a branch
  getSubjects: async (branch = "Civil Engineering") => {
    try {
      const response = await API.get("exams/subjects/", {
        params: { branch },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching subjects:", error);
      throw error;
    }
  },

  // Get chapters for a subject
  getChapters: async (subject, branch = "Civil Engineering") => {
    try {
      const response = await API.get(
        `exams/subjects/${encodeURIComponent(subject)}/chapters/`,
        { params: { branch } }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching chapters:", error);
      throw error;
    }
  },

  // Get questions for a chapter
  getQuestions: async (
    subject,
    chapter,
    branch = "Civil Engineering",
    page = 1,
    pageSize = 5
  ) => {
    try {
      const response = await API.get(
        `exams/subjects/${encodeURIComponent(subject)}/chapters/${encodeURIComponent(
          chapter
        )}/questions/`,
        { params: { branch, page, page_size: pageSize } }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching questions:", error);
      throw error;
    }
  },

  // Get a single question
  getQuestion: async (questionId) => {
    try {
      const response = await API.get(`exams/questions/${questionId}/`);
      return response.data;
    } catch (error) {
      console.error("Error fetching question:", error);
      throw error;
    }
  },

  // Submit answer
  submitAnswer: async (questionId, selectedOption) => {
    try {
      const response = await API.post("exams/questions/submit/", {
        question_id: questionId,
        selected_option: selectedOption,
      });
      return response.data;
    } catch (error) {
      console.error("Error submitting answer:", error);
      throw error;
    }
  },

  // Create a question (admin only)
  createQuestion: async (chapterId, questionData) => {
    try {
      const response = await API.post("exams/questions/create/", {
        chapter_id: chapterId,
        ...questionData,
      });
      return response.data;
    } catch (error) {
      console.error("Error creating question:", error);
      throw error;
    }
  },

  // Delete question (admin only)
  deleteQuestion: async (questionId) => {
    try {
      const response = await API.delete(`exams/questions/${questionId}/`);
      return response.data;
    } catch (error) {
      console.error("Error deleting question:", error);
      throw error;
    }
  },

  // Create subject (admin only)
  createSubject: async (name, branch = "Civil Engineering") => {
    try {
      const response = await API.post("exams/subjects/create/", { name, branch });
      return response.data;
    } catch (error) {
      console.error("Error creating subject:", error);
      throw error;
    }
  },

  // Create chapter (admin only)
  createChapter: async (subjectId, name, order = 0, smallNote = "") => {
    try {
      const response = await API.post("exams/chapters/create/", {
        subject_id: subjectId,
        name,
        order,
        small_note: smallNote,
      });
      return response.data;
    } catch (error) {
      console.error("Error creating chapter:", error);
      throw error;
    }
  },

  // Update chapter note (admin only)
  updateChapterNote: async (chapterId, smallNote) => {
    try {
      const response = await API.patch(`exams/chapters/${chapterId}/`, {
        small_note: smallNote,
      });
      return response.data;
    } catch (error) {
      console.error("Error updating chapter note:", error);
      throw error;
    }
  },

  // Delete chapter (admin only)
  deleteChapter: async (chapterId, deleteSourceFiles = true) => {
    try {
      const response = await API.post(`exams/chapters/${chapterId}/delete/`, {
        delete_source_files: !!deleteSourceFiles,
      });
      return response.data;
    } catch (error) {
      console.error("Error deleting chapter:", error);
      throw error;
    }
  },

  // Delete subject (admin only)
  deleteSubject: async (subjectId, deleteSourceFolder = true) => {
    try {
      const response = await API.post(`exams/subjects/${subjectId}/delete/`, {
        delete_source_folder: !!deleteSourceFolder,
      });
      return response.data;
    } catch (error) {
      console.error("Error deleting subject:", error);
      throw error;
    }
  },

  // Bulk upload questions (admin only)
  bulkUploadQuestions: async (chapterId, questions) => {
    try {
      const response = await API.post("exams/questions/bulk-upload/", {
        chapter_id: chapterId,
        questions,
      });
      return response.data;
    } catch (error) {
      console.error("Error bulk uploading questions:", error);
      throw error;
    }
  },

  // Bulk upload question file (.csv/.tsv/.json/.xlsx/.xls)
  bulkUploadQuestionsFile: async (chapterId, file) => {
    try {
      const formData = new FormData();
      formData.append("chapter_id", chapterId);
      formData.append("questions_file", file);
      const response = await API.post("exams/questions/bulk-upload/", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error bulk uploading question file:", error);
      throw error;
    }
  },

  // Bulk upload questions from backend file path
  bulkUploadQuestionsFromPath: async (chapterId, filePath) => {
    try {
      const response = await API.post("exams/questions/bulk-upload/", {
        chapter_id: chapterId,
        file_path: filePath,
      });
      return response.data;
    } catch (error) {
      console.error("Error importing questions from file path:", error);
      throw error;
    }
  },

  // Sync all objective and exam-set questions from Dropbox paths for a branch (admin only)
  syncDropboxQuestionBank: async (
    branch = "Civil Engineering",
    replaceExisting = true,
    syncObjective = true,
    syncExamSets = true
  ) => {
    try {
      const response = await API.post("exams/sync/dropbox/", {
        branch,
        replace_existing: replaceExisting,
        sync_objective: syncObjective,
        sync_exam_sets: syncExamSets,
      });
      return response.data;
    } catch (error) {
      console.error("Error syncing Dropbox question bank:", error);
      throw error;
    }
  },

  // Get user progress
  getUserProgress: async (subject, chapter, branch = "Civil Engineering") => {
    try {
      const response = await API.get(
        `exams/subjects/${encodeURIComponent(subject)}/chapters/${encodeURIComponent(
          chapter
        )}/progress/`,
        { params: { branch } }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching progress:", error);
      throw error;
    }
  },
};
