import { useQueryStates } from "nuqs";
import { emulatorsParams } from "../params";

export const useEmulatorsParams = () => {
  return useQueryStates(emulatorsParams);
};
