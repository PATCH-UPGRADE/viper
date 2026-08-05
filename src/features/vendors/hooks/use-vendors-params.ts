import { useQueryStates } from "nuqs";
import { vendorsParams } from "../params";

export const useVendorsParams = () => useQueryStates(vendorsParams);
