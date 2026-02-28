// ---------------------------------------------------------------------------
// browclaw — Tool activity indicator
// ---------------------------------------------------------------------------

interface Props {
  tool: string;
  status: string;
}

export function ToolActivity({ tool }: Props) {
  return (
    <div className="chat chat-start">
      <div className="chat-bubble text-sm py-2">
        <span className="loading loading-dots loading-xs mr-2" />
        Using <strong>{tool}</strong>...
      </div>
    </div>
  );
}
