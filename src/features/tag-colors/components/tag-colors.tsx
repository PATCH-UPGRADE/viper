"use client";

import {
  EntityContainer,
  EntityHeader,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useSuspenseDepartments,
  useUpdateDepartment,
} from "@/features/departments/hooks/use-departments";
import { TicketCategory } from "@/generated/prisma";
import { ColorPicker } from "./color-picker";
import { getChipClass, type TagHue } from "../palette";
import {
  useSetCategoryColor,
  useSuspenseCategoryColors,
} from "../hooks/use-tag-colors";

const categoryLabels: Record<TicketCategory, string> = {
  PATCH: "Patch",
  CONFIG_CHANGE: "Config Change",
  VULN_REMEDIATION: "Vuln Remediation",
  ADVISORY_RESPONSE: "Advisory Response",
  CLINICAL_REVIEW: "Clinical Review",
  FIRMWARE_UPDATE: "Firmware Update",
  NETWORK_REMEDIATION: "Network Remediation",
  NEW_ASSET_PROCUREMENT: "New Asset Procurement",
  OTHER: "Other",
};

const DepartmentSection = () => {
  const { data: departments } = useSuspenseDepartments();
  const updateMutation = useUpdateDepartment();

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">Departments</h2>
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead className="w-48">Color</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments.map((dept) => (
              <TableRow key={dept.id}>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={getChipClass(dept.color)}
                  >
                    {dept.name}
                  </Badge>
                </TableCell>
                <TableCell>
                  <ColorPicker
                    value={dept.color}
                    onChange={(hue: TagHue) =>
                      updateMutation.mutate({ id: dept.id, color: hue })
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

const CategorySection = () => {
  const { data: categoryColors } = useSuspenseCategoryColors();
  const setColor = useSetCategoryColor();

  const colorMap = new Map(categoryColors.map((c) => [c.category, c.color]));

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">Categories</h2>
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="w-48">Color</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.values(TicketCategory).map((category) => {
              const color = colorMap.get(category);
              return (
                <TableRow key={category}>
                  <TableCell>
                    <Badge variant="outline" className={getChipClass(color)}>
                      {categoryLabels[category]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ColorPicker
                      value={color}
                      onChange={(hue: TagHue) =>
                        setColor.mutate({ category, color: hue })
                      }
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export const TagColorsList = () => {
  return (
    <div className="flex flex-col gap-8">
      <DepartmentSection />
      <CategorySection />
    </div>
  );
};

export const TagColorsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer
      header={
        <EntityHeader
          title="Tag Colors"
          description="Set the colors used for department and category chips across the app."
        />
      }
    >
      {children}
    </EntityContainer>
  );
};

export const TagColorsLoading = () => (
  <LoadingView message="Loading tag colors..." />
);
export const TagColorsError = () => (
  <ErrorView message="Error loading tag colors" />
);
