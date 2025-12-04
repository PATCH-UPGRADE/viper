import { useQueryStates } from "nuqs";
import { integrationsParams } from "../params";

export const useIntegrationsParams = () => {
  return useQueryStates(integrationsParams);
};
