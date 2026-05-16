import API from "./api";

export const discussionsService = {
  listClassrooms: async (branch = "Civil Engineering") => {
    const response = await API.get("discussions/classrooms/", {
      params: { branch },
    });
    return response.data;
  },

  createClassroom: async (payload) => {
    const response = await API.post("discussions/classrooms/", payload);
    return response.data;
  },

  updateClassroom: async (classroomId, payload) => {
    const response = await API.patch(`discussions/classrooms/${classroomId}/`, payload);
    return response.data;
  },

  deleteClassroom: async (classroomId) => {
    const response = await API.delete(`discussions/classrooms/${classroomId}/`);
    return response.data;
  },

  listMessages: async (classroomId, sinceId = 0, limit = 120) => {
    const response = await API.get(`discussions/classrooms/${classroomId}/messages/`, {
      params: {
        since_id: Number(sinceId || 0),
        limit: Number(limit || 120),
      },
    });
    return response.data;
  },

  sendMessage: async (classroomId, text) => {
    const response = await API.post(`discussions/classrooms/${classroomId}/messages/`, { text });
    return response.data;
  },

  updateMessage: async (messageId, payload) => {
    const response = await API.patch(`discussions/messages/${messageId}/`, payload);
    return response.data;
  },

  deleteMessage: async (messageId) => {
    const response = await API.delete(`discussions/messages/${messageId}/`);
    return response.data;
  },
};

