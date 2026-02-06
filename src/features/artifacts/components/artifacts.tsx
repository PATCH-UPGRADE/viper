import { ExternalLinkIcon } from "lucide-react";
import type { ArtifactWrapperWithUrls } from "@/lib/schemas";
import { formatFileSize } from "@/lib/utils";

export const ArtifactsDrawerEntry = ({
  artifacts,
}: {
  artifacts: ArtifactWrapperWithUrls[];
}) => {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold">Artifacts</h3>

      {artifacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No artifacts available</p>
      ) : (
        <div className="flex flex-col gap-3">
          {artifacts.map((artifact) => (
            <div key={artifact.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {artifact.latestArtifact.name ||
                    artifact.latestArtifact.artifactType}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                  v{artifact.latestArtifact.versionNumber}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {artifact.latestArtifact.artifactType}
                </span>
              </div>
              {artifact.latestArtifact.downloadUrl && (
                <a
                  href={artifact.latestArtifact.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1 break-all"
                >
                  {artifact.latestArtifact.downloadUrl}
                  <ExternalLinkIcon className="size-3 flex-shrink-0" />
                </a>
              )}
              {artifact.latestArtifact.size && (
                <span className="text-xs text-muted-foreground">
                  Size: {formatFileSize(Number(artifact.latestArtifact.size))}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
