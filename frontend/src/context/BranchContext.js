import React, { createContext, useContext, useMemo, useState } from "react";

const BRANCHES = [
  "Civil Engineering",
  "Mechanical Engineering",
  "Electrical Engineering",
  "Electronics Engineering",
  "Computer Engineering",
];

const BranchContext = createContext();

export function BranchProvider({ children }) {
  const [branch, setBranch] = useState(() => {
    const savedBranch = localStorage.getItem("branch");
    return BRANCHES.includes(savedBranch) ? savedBranch : BRANCHES[0];
  });

  const updateBranch = (nextBranch) => {
    const normalizedBranch = BRANCHES.includes(nextBranch) ? nextBranch : BRANCHES[0];
    setBranch(normalizedBranch);
    localStorage.setItem("branch", normalizedBranch);
  };

  const setBranchFromProfile = (profileBranch) => {
    const normalizedBranch = BRANCHES.includes(profileBranch) ? profileBranch : BRANCHES[0];
    setBranch(normalizedBranch);
    localStorage.setItem("branch", normalizedBranch);
  };

  const value = useMemo(
    () => ({ branch, setBranch: updateBranch, setBranchFromProfile, branches: BRANCHES }),
    [branch]
  );
  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  return useContext(BranchContext);
}
