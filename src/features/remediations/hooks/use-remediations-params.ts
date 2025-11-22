import { useQueryStates } from "nuqs";
import { remediationsParams } from "../params";

export const useRemediationsParams = () => {
  return useQueryStates(remediationsParams);
};
