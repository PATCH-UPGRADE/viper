"use client";

import { useQueryStates } from "nuqs";
import { interruptionsParams } from "../params";

export const useInterruptionsParams = () => {
  return useQueryStates(interruptionsParams);
};

/** Opens a ticket in the drawer by setting the `ticket` URL param. */
export const useOpenTicket = () => {
  const [, setParams] = useInterruptionsParams();
  return (id: string) => setParams({ ticket: id });
};
