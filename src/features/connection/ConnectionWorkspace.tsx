import { DockWorkspace } from "../dock/DockWorkspace";

interface ConnectionWorkspaceProps {
  connectionId: string;
}

export function ConnectionWorkspace({ connectionId }: ConnectionWorkspaceProps) {
  return <DockWorkspace connectionId={connectionId} />;
}
