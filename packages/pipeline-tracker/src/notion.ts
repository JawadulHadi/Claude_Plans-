/**
 * Notion pipeline sync — Phase 3 full wiring via Notion MCP connector.
 * For now: structured stub that logs what would be synced, ready to wire
 * when NOTION_DATABASE_ID is configured.
 */

export interface NotionPipelineRow {
  applicationId: string;
  jobTitle: string;
  company: string;
  status: string;
  matchScore: number;
  appliedAt?: string;
  jobUrl: string;
  board: string;
}

export async function syncToNotion(row: NotionPipelineRow): Promise<void> {
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!databaseId) {
    // Phase 3: wire Notion MCP connector here
    console.log('[notion] NOTION_DATABASE_ID not set — skipping sync for', row.applicationId);
    return;
  }

  // Phase 3 implementation: use Notion MCP tools to upsert a page
  // into the pipeline tracking database.
  // The MCP connector is available in this session (mcp__Notion__*).
  console.log('[notion] would sync', row);
}

export async function updateNotionStatus(
  applicationId: string,
  newStatus: string,
): Promise<void> {
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!databaseId) return;

  // Phase 3: query Notion for the page with this applicationId,
  // then update its Status property.
  console.log('[notion] would update status for', applicationId, '->', newStatus);
}
