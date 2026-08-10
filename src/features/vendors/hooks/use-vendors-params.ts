import { useQueryStates } from "nuqs";
import { vendorsParams } from "../params";

export const useVendorsParams = () => {
  return useQueryStates(vendorsParams);
};
