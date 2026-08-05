import { Button } from "@/components/ui/button";

export function AssetQrPdfLink({ assetId }: { assetId: string }) {
  return (
    <Button variant="outline" asChild>
      <a
        href={`/api/assets/${assetId}/qr-pdf`}
        target="_blank"
        rel="noreferrer"
      >
        QR Code Printout
      </a>
    </Button>
  );
}
