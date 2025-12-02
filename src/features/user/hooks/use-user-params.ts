import { useQueryStates } from "nuqs";
import { apiTokenParams } from "../params";

export const useApiTokenParams = () => {
  return useQueryStates(apiTokenParams);
};
