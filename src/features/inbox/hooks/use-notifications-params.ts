"use client";

import { useQueryStates } from "nuqs";
import { inboxParams } from "../params";

export const useNotificationsParams = () => {
  return useQueryStates(inboxParams);
};
