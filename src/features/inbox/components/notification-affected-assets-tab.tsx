"use client";

import { Unlink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MoreVerticalDropdownMenu } from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { deviceGroupMatchingLabel, parseLocation } from "@/lib/markdown";
import { useMarkMatchIncorrect } from "../hooks/use-notifications";
import type { NotificationDetailWithRelations } from "../types";

type DeviceGroupMapping =
  NotificationDetailWithRelations["deviceGroupsMatchings"][number];

export function NotificationAffectedAssetsTab({
  notificationId,
  deviceGroupsMatchings,
}: {
  notificationId: string;
  deviceGroupsMatchings: NotificationDetailWithRelations["deviceGroupsMatchings"];
}) {
  const withAssets = deviceGroupsMatchings.filter((m) => m.assetCount > 0);
  const withoutAssets = deviceGroupsMatchings.filter((m) => m.assetCount === 0);
  const [rejecting, setRejecting] = useState<DeviceGroupMapping | null>(null);
  const [comment, setComment] = useState("");
  const [showMissing, setShowMissing] = useState(false);
  const markMatchIncorrect = useMarkMatchIncorrect();

  const closeDialog = () => {
    setRejecting(null);
    setComment("");
  };

  const confirmUnlink = async (commentToSave: string | undefined) => {
    if (!rejecting) return;
    const label = deviceGroupMatchingLabel(rejecting.deviceGroupMatching);
    await markMatchIncorrect.mutateAsync({
      targetType: "NotificationDeviceGroupMapping",
      targetId: rejecting.id,
      notificationId,
      comment: commentToSave,
    });
    toast.success(`${label} unlinked from notification`);
    closeDialog();
  };

  if (withAssets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No device groups with matching assets found.
      </p>
    );
  }

  return (
    <>
      {withAssets.map((mapping) => (
        <Card key={mapping.id}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {deviceGroupMatchingLabel(mapping.deviceGroupMatching)}
              <Badge variant="secondary" className="font-normal">
                {mapping.assetCount}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardAction>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => setRejecting(mapping)}
                aria-label="Unlink this device group"
              >
                <Unlink className="size-4" />
              </Button>
            </CardAction>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset ID</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {mapping.assets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-mono text-xs">
                      {asset.hostname ?? asset.id}
                    </TableCell>
                    <TableCell>{asset.ip}</TableCell>
                    <TableCell>{parseLocation(asset.location)}</TableCell>
                    <TableCell>{asset.version ?? "—"}</TableCell>
                    <TableCell>{asset.status ?? "—"}</TableCell>
                    <TableCell>
                      <MoreVerticalDropdownMenu
                        items={[
                          {
                            label: "View asset detail",
                            href: `/assets/${asset.id}`,
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
      {withoutAssets.length > 0 && (
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="text-sm font-normal">
              This advisory applies to{" "}
              <b>{withAssets.length} of your products</b>. The vendor bulletin
              listed <b>{deviceGroupsMatchings.length}</b>.
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Collapsible open={showMissing} onOpenChange={setShowMissing}>
              <CollapsibleTrigger
                chevron
                className="text-sm hover:text-foreground"
              >
                {showMissing ? "Hide" : "Show"} the {withoutAssets.length}{" "}
                products not in your inventory
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ol className="mt-2 space-y-1 pl-5 text-sm text-muted-foreground list-decimal">
                  {withoutAssets.map((mapping) => (
                    <li key={mapping.id}>
                      {deviceGroupMatchingLabel(mapping.deviceGroupMatching)}
                    </li>
                  ))}
                </ol>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}
      <Dialog
        open={!!rejecting}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlink className="size-4 text-destructive" />
              Unlink{" "}
              {rejecting
                ? deviceGroupMatchingLabel(rejecting.deviceGroupMatching)
                : ""}
              ?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {rejecting && (
              <>
                This device group has been unlinked from the notification. Add a
                short note on why - it's recorded in the activity log.
              </>
            )}
          </p>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment (optional)"
            rows={3}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => confirmUnlink(undefined)}
              disabled={markMatchIncorrect.isPending}
            >
              Skip
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmUnlink(comment.trim() || undefined)}
              disabled={markMatchIncorrect.isPending}
            >
              Save reason
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
