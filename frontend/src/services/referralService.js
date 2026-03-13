import API from "./api";

export const referralService = {
  submitReferral: async (payload) => {
    const res = await API.post("accounts/referrals/", payload);
    return res.data;
  },

  claimUnlock: async (examSetId) => {
    const res = await API.post("accounts/referrals/unlock/", { exam_set_id: examSetId });
    return res.data;
  },
};
