import {
  EDITABLE_WORK_ORDER_FIELD_LABELS,
  type EditableWorkOrderField,
} from "@/features/integrations/core/types";

export interface LockedField {
  field: EditableWorkOrderField;
  /** The integration that owns the field, for the message the user sees. */
  managedBy: string;
}

/** Why VIPER refuses an edit to a field that a platform owns. */
export const lockedFieldMessage = (
  field: EditableWorkOrderField,
  managedBy: string,
) =>
  `The ${EDITABLE_WORK_ORDER_FIELD_LABELS[field]} of this work order is managed in ${managedBy}.`;
