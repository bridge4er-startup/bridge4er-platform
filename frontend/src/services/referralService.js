import API from "./api";

export const referralService = {
  submitReferral: async (payload) => {
    const res = await API.post("accounts/referrals/", payload);
    return res.data;
  },

  claimUnlock: async (examSetName) => {
    const res = await API.post("accounts/referrals/unlock/", { exam_set_name: examSetName });
    return res.data;
  },
};
