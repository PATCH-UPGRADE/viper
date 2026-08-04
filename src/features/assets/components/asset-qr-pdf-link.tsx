import { QrCodeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AssetQrPdfLink({ assetId }: { assetId: string }) {
  return (
    <Button variant="outline" size="lg" asChild>
      <a
        href={`/api/assets/${assetId}/qr-pdf`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <QrCodeIcon className="size-4" />
        QR Code Printout
      </a>
    </Button>
  );
}
